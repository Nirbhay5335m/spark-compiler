import os
import re
import sys
import time
import uuid
import json
import subprocess
import threading
from pathlib import Path
from contextlib import contextmanager
from typing import Dict, Any, List, Optional
from backend.app.core.config import settings
from backend.app.core.logging_config import logger


def clean_spark_error(raw_error: str) -> str:
    """Extracts clean, user-friendly error messages from PySpark / Java exception traces."""
    if not raw_error:
        return "Unknown execution error."

    # 1. Spark SQL AnalysisException
    if "AnalysisException" in raw_error:
        for line in raw_error.splitlines():
            line_s = line.strip()
            if "TABLE_OR_VIEW_NOT_FOUND" in line_s:
                # e.g. [TABLE_OR_VIEW_NOT_FOUND] The table or view `foo` cannot be found.
                return line_s
            if "[UNRESOLVED_COLUMN]" in line_s:
                return line_s
            if "[UNRESOLVED_ROUTINE]" in line_s:
                return line_s
            if line_s.startswith("org.apache.spark.sql.AnalysisException:"):
                return line_s.split("AnalysisException:", 1)[1].strip()
        match = re.search(r"AnalysisException:\s*([^\n\r]+)", raw_error)
        if match:
            return match.group(1).strip()

    # 2. Spark SQL ParseException (Syntax Errors)
    if "ParseException" in raw_error or "SYNTAX_ERROR" in raw_error:
        syntax_lines = []
        for line in raw_error.splitlines():
            line_s = line.strip()
            if any(k in line_s for k in ("SYNTAX_ERROR", "ParseException", "line ", "at or near", "^", "== SQL ==")):
                if not line_s.startswith("at org.apache"):
                    syntax_lines.append(line_s)
        if syntax_lines:
            return "\n".join(syntax_lines[:4])
        match = re.search(r"ParseException:\s*([^\n\r]+)", raw_error)
        if match:
            return match.group(1).strip()

    # 3. Py4J Java Exception summary
    if "Py4JJavaError:" in raw_error:
        parts = raw_error.split("Py4JJavaError:", 1)[1]
        for line in parts.splitlines():
            line_s = line.strip()
            if line_s and not line_s.startswith("at org.apache") and not line_s.startswith("at java.") and not line_s.startswith("at py4j."):
                return line_s.lstrip(": ")

    # 4. Standard Python Exception Traceback
    if "Traceback (most recent call last):" in raw_error:
        lines = [l.strip() for l in raw_error.strip().splitlines() if l.strip()]
        if lines:
            last_line = lines[-1]
            if len(lines) >= 2 and lines[-2].startswith("File "):
                return f"{last_line} ({lines[-2]})"
            return last_line

    # 5. Default concise first lines
    meaningful = [
        l.strip() for l in raw_error.splitlines()
        if l.strip() and not l.strip().startswith("at ") and not l.strip().startswith("WARN ")
    ]
    return meaningful[0] if meaningful else raw_error[:250]


def parse_ascii_spark_table(output_text: str) -> Optional[Dict[str, Any]]:
    """Extracts columns and rows from an ASCII Spark DataFrame table if present in stdout."""
    lines = [line.strip() for line in output_text.splitlines() if line.strip()]
    table_lines = []
    in_table = False
    
    for line in lines:
        if line.startswith("+") and line.endswith("+") and "-" in line:
            table_lines.append(line)
            in_table = True
        elif in_table and line.startswith("|") and line.endswith("|"):
            table_lines.append(line)
        elif in_table and not (line.startswith("|") or line.startswith("+")):
            if len(table_lines) >= 3:
                break
            table_lines = []
            in_table = False

    if len(table_lines) < 3:
        return None

    header_line = table_lines[1]
    raw_cols = [c.strip() for c in header_line.strip("|").split("|") if c.strip()]
    
    rows = []
    for line in table_lines[3:]:
        if line.startswith("+"):
            continue
        parts = [p.strip() for p in line.strip("|").split("|")]
        if len(parts) == len(raw_cols):
            row_dict = {}
            for col_name, val in zip(raw_cols, parts):
                if val.lower() == "true":
                    typed_val = True
                elif val.lower() == "false":
                    typed_val = False
                elif val.isdigit():
                    typed_val = int(val)
                else:
                    try:
                        typed_val = float(val)
                    except ValueError:
                        typed_val = val
                row_dict[col_name] = typed_val
            rows.append(row_dict)

    if raw_cols and rows:
        schema = [{"name": c, "type": "StringType"} for c in raw_cols]
        return {
            "columns": raw_cols,
            "schema": schema,
            "rows": rows,
            "row_count": len(rows),
        }
    return None


class SparkService:
    """Dedicated service layer for Apache Spark lifecycle management and execution.
    
    Adheres strictly to lazy initialization: no SparkSession is created until
    explicitly requested during job execution, and sessions are safely stopped
    immediately upon completion.
    """

    def __init__(self):
        self._ensure_spark_path()
        self._active_processes: Dict[str, subprocess.Popen] = {}
        self._lock = threading.Lock()
        
        # Ensure temporary jobs execution directory exists
        self.jobs_dir = settings.DATA_DIR / "jobs"
        self.jobs_dir.mkdir(parents=True, exist_ok=True)

    def _ensure_spark_path(self) -> None:
        """Injects SPARK_HOME python packages into sys.path if PySpark is bundled locally."""
        spark_home = settings.SPARK_HOME
        if spark_home and Path(spark_home).is_dir():
            py_path = Path(spark_home) / "python"
            lib_path = py_path / "lib"
            
            if py_path.exists() and str(py_path) not in sys.path:
                sys.path.insert(0, str(py_path))
            
            if lib_path.exists():
                for zip_file in lib_path.glob("*.zip"):
                    if str(zip_file) not in sys.path:
                        sys.path.insert(0, str(zip_file))

    def detect_java(self) -> Dict[str, Any]:
        """Detects Java runtime environment and version."""
        java_home = settings.JAVA_HOME or os.environ.get("JAVA_HOME", "")
        java_bin = "java"
        if java_home:
            candidate = Path(java_home) / "bin" / ("java.exe" if os.name == "nt" else "java")
            if candidate.exists():
                java_bin = str(candidate)

        try:
            result = subprocess.run(
                [java_bin, "-version"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=5,
            )
            version_output = result.stderr if result.stderr else result.stdout
            lines = version_output.strip().split("\n")
            first_line = lines[0] if lines else "Unknown Java Version"
            return {
                "available": True,
                "version": first_line.strip(),
                "java_home": java_home or "System Default",
            }
        except Exception as e:
            logger.warning(f"Java detection failed: {e}")
            return {
                "available": False,
                "version": None,
                "java_home": java_home or None,
                "error": str(e),
            }

    def detect_spark(self) -> Dict[str, Any]:
        """Detects Spark installation and version without starting a SparkContext."""
        spark_home = settings.SPARK_HOME or os.environ.get("SPARK_HOME", "")
        spark_version = None
        is_installed = False

        if spark_home and Path(spark_home).is_dir():
            # Check RELEASE file
            release_file = Path(spark_home) / "RELEASE"
            if release_file.exists():
                try:
                    spark_version = release_file.read_text(encoding="utf-8").strip().split("\n")[0]
                    is_installed = True
                except Exception as e:
                    logger.debug(f"Failed to read Spark RELEASE file: {e}")

        # Test PySpark import availability
        pyspark_available = False
        pyspark_version = None
        try:
            self._ensure_spark_path()
            import pyspark
            pyspark_available = True
            pyspark_version = getattr(pyspark, "__version__", None)
            if not spark_version and pyspark_version:
                spark_version = f"PySpark {pyspark_version}"
                is_installed = True
        except ImportError:
            pyspark_available = False

        return {
            "available": is_installed or pyspark_available,
            "version": spark_version or pyspark_version or "Unknown",
            "spark_home": spark_home or None,
            "pyspark_available": pyspark_available,
        }

    def get_status(self) -> Dict[str, Any]:
        """Returns comprehensive environment and Spark readiness status."""
        java_info = self.detect_java()
        spark_info = self.detect_spark()

        is_ready = bool(java_info.get("available") and spark_info.get("available"))
        status = "ready" if is_ready else "unavailable"

        return {
            "status": status,
            "spark_available": spark_info.get("available", False),
            "spark_version": spark_info.get("version"),
            "spark_home": spark_info.get("spark_home"),
            "java_available": java_info.get("available", False),
            "java_version": java_info.get("version"),
            "java_home": java_info.get("java_home"),
            "pyspark_available": spark_info.get("pyspark_available", False),
            "message": (
                "Spark and Java environment verified and ready for lazy execution."
                if is_ready
                else "Spark or Java environment missing or improperly configured."
            ),
        }

    @contextmanager
    def get_lazy_session(self, app_name: str = "SparkCompilerJob"):
        """Context manager providing an on-demand SparkSession with safe cleanup."""
        self._ensure_spark_path()

        # Set PySpark driver/worker interpreter to current Python executable
        os.environ["PYSPARK_PYTHON"] = sys.executable
        os.environ["PYSPARK_DRIVER_PYTHON"] = sys.executable

        if settings.JAVA_HOME and not os.environ.get("JAVA_HOME"):
            os.environ["JAVA_HOME"] = settings.JAVA_HOME
        if settings.SPARK_HOME and not os.environ.get("SPARK_HOME"):
            os.environ["SPARK_HOME"] = settings.SPARK_HOME

        try:
            from pyspark.sql import SparkSession
        except ImportError as e:
            logger.error(f"PySpark import failed: {e}")
            raise RuntimeError(f"PySpark is not accessible: {e}") from e

        logger.info(f"Lazily initializing SparkSession '{app_name}'...")
        spark = None
        try:
            spark = (
                SparkSession.builder
                .master("local[1]")
                .appName(app_name)
                .config("spark.ui.enabled", "false")
                .config("spark.driver.host", "127.0.0.1")
                .config("spark.driver.bindAddress", "127.0.0.1")
                .config("spark.sql.shuffle.partitions", "1")
                .config("spark.default.parallelism", "1")
                .config("spark.driver.memory", "350m")
                .config("spark.driver.extraJavaOptions", "-Xms128m -Xmx384m -XX:+UseSerialGC")
                .config("spark.executor.extraJavaOptions", "-Xms128m -Xmx384m -XX:+UseSerialGC")
                .getOrCreate()
            )
            logger.info("SparkSession successfully acquired.")
            yield spark
        except Exception as e:
            logger.error(f"Error during SparkSession execution: {e}", exc_info=True)
            raise
        finally:
            if spark is not None:
                logger.info(f"Safely stopping SparkSession '{app_name}'...")
                try:
                    spark.stop()
                    logger.info("SparkSession stopped cleanly.")
                except Exception as stop_err:
                    logger.warning(f"Error stopping SparkSession: {stop_err}")

    def run_test_job(self, custom_records: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        """Runs an isolated, lazy DataFrame transformation test and returns execution stats."""
        start_time = time.perf_counter()
        
        default_data = [
            {"id": 101, "module": "Lexer", "status": "active", "tokens_processed": 1420},
            {"id": 102, "module": "Parser", "status": "active", "tokens_processed": 980},
            {"id": 103, "module": "Optimizer", "status": "pending", "tokens_processed": 0},
            {"id": 104, "module": "CodeGenerator", "status": "active", "tokens_processed": 3100},
            {"id": 105, "module": "SparkBridge", "status": "active", "tokens_processed": 5400},
        ]
        input_data = custom_records if custom_records is not None else default_data

        try:
            with self.get_lazy_session("SparkCompilerTestSession") as spark:
                from pyspark.sql.functions import col, upper, when

                df = spark.createDataFrame(input_data)
                
                # Perform sample DataFrame transformations
                transformed_df = df.withColumn("module_upper", upper(col("module"))).withColumn(
                    "is_high_throughput",
                    when(col("tokens_processed") > 1000, True).otherwise(False)
                )

                # Collect results
                collected_rows = [row.asDict() for row in transformed_df.collect()]
                total_tokens = sum(row.get("tokens_processed", 0) for row in collected_rows)
                active_modules = [r["module"] for r in collected_rows if r.get("status") == "active"]

                elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)

                return {
                    "success": True,
                    "execution_time_ms": elapsed_ms,
                    "rows_processed": len(collected_rows),
                    "spark_version": spark.version,
                    "app_name": "SparkCompilerTestSession",
                    "results": collected_rows,
                    "summary": {
                        "total_modules": len(collected_rows),
                        "active_modules_count": len(active_modules),
                        "total_tokens_processed": total_tokens,
                    },
                }
        except Exception as e:
            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.error(f"Spark test job failed: {e}")
            return {
                "success": False,
                "execution_time_ms": elapsed_ms,
                "error": str(e),
                "rows_processed": 0,
                "results": [],
            }

    def execute_code(self, code: str, job_id: Optional[str] = None, timeout_seconds: int = 120) -> Dict[str, Any]:
        """Executes arbitrary PySpark/Python code in an isolated subprocess.
        
        Captures stdout, stderr, exit code, execution time, and extracts structured DataFrame results.
        """
        if not job_id:
            job_id = f"job-{uuid.uuid4().hex[:8]}"

        start_time = time.perf_counter()
        job_file = self.jobs_dir / f"{job_id}.py"

        # Build execution environment
        env = os.environ.copy()
        timeout_seconds = min(timeout_seconds, settings.MAX_EXECUTION_TIMEOUT_SECONDS)

        # Sanitize environment to prevent user code accessing host secrets or credentials
        sensitive_keys = [
            k for k in env
            if any(s in k.upper() for s in ("SECRET", "TOKEN", "PASSWORD", "KEY", "CREDENTIAL", "AWS_", "RENDER_", "DATABASE", "AUTH", "PRIVATE"))
        ]
        for sk in sensitive_keys:
            env.pop(sk, None)

        if settings.JAVA_HOME:
            env["JAVA_HOME"] = settings.JAVA_HOME
        if settings.SPARK_HOME:
            env["SPARK_HOME"] = settings.SPARK_HOME
        
        env["PYSPARK_PYTHON"] = sys.executable
        env["PYSPARK_DRIVER_PYTHON"] = sys.executable

        # Inject PySpark into PYTHONPATH for the subprocess
        python_paths = []
        if settings.SPARK_HOME:
            spark_py = Path(settings.SPARK_HOME) / "python"
            if spark_py.exists():
                python_paths.append(str(spark_py))
            lib_py = spark_py / "lib"
            if lib_py.exists():
                for zip_file in lib_py.glob("*.zip"):
                    python_paths.append(str(zip_file))

        existing_pythonpath = env.get("PYTHONPATH", "")
        if existing_pythonpath:
            python_paths.append(existing_pythonpath)
        
        if python_paths:
            env["PYTHONPATH"] = os.pathsep.join(python_paths)

        # Inject automatic DataFrame probe code (supports up to 10,000 rows)
        probe_code = f"""
# --- AUTOMATIC SPARK COMPILER RESULT PROBE ---
try:
    import json as _sc_json
    import sys as _sc_sys
    _target_df = None
    try:
        from pyspark.sql import DataFrame as _PySparkDF
    except ImportError:
        _PySparkDF = None

    for _var_name in ['result', 'transformed_df', 'agg_df', 'df', 'output_df', 'final_df', 'clean_df']:
        if _var_name in globals():
            _val = globals()[_var_name]
            if _PySparkDF and isinstance(_val, _PySparkDF):
                _target_df = _val
                break
            elif isinstance(_val, list) and len(_val) > 0 and isinstance(_val[0], dict):
                _cols = list(_val[0].keys())
                _schema = [{{"name": str(_c), "type": type(_val[0][_c]).__name__}} for _c in _cols]
                print("__SPARK_COMPILER_RESULT_JSON__" + _sc_json.dumps({{
                    "columns": _cols,
                    "schema": _schema,
                    "rows": _val[:{settings.MAX_RESULT_ROWS}],
                    "row_count": len(_val)
                }}))
                break

    if _PySparkDF and _target_df is not None and isinstance(_target_df, _PySparkDF):
        try:
            _schema = [{{"name": str(_f.name), "type": str(_f.dataType)}} for _f in _target_df.schema.fields]
            _cols = [str(_f.name) for _f in _target_df.schema.fields]
            _rows = [_r.asDict() for _r in _target_df.limit({settings.MAX_RESULT_ROWS}).collect()]
            _count = _target_df.count()
            print("__SPARK_COMPILER_RESULT_JSON__" + _sc_json.dumps({{
                "columns": _cols,
                "schema": _schema,
                "rows": _rows,
                "row_count": _count
            }}))
        except Exception:
            pass
except Exception:
    pass
"""
        full_code = f"{code}\n\n{probe_code}"

        # Write code to temporary script
        try:
            job_file.write_text(full_code, encoding="utf-8")
        except Exception as e:
            logger.error(f"Failed to write script for job {job_id}: {e}")
            return {
                "job_id": job_id,
                "success": False,
                "exit_code": -1,
                "stdout": "",
                "stderr": f"Failed to initialize script file: {e}",
                "execution_time_ms": 0,
                "dataframe": None,
                "error": str(e),
            }

        logger.info(f"Spawning subprocess for job {job_id}...")
        process: Optional[subprocess.Popen] = None
        try:
            process = subprocess.Popen(
                [sys.executable, str(job_file)],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env=env,
                cwd=str(settings.BASE_DIR.parent),
            )

            with self._lock:
                self._active_processes[job_id] = process

            stdout_data, stderr_data = process.communicate(timeout=timeout_seconds)
            exit_code = process.returncode
            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)

            is_success = (exit_code == 0)
            logger.info(f"Job {job_id} completed with exit code {exit_code} in {elapsed_ms} ms.")

            # Extract structured DataFrame result from stdout if present
            raw_stdout = stdout_data or ""
            dataframe_result = None
            clean_lines = []
            
            for line in raw_stdout.splitlines():
                if line.startswith("__SPARK_COMPILER_RESULT_JSON__"):
                    try:
                        json_str = line[len("__SPARK_COMPILER_RESULT_JSON__"):].strip()
                        dataframe_result = json.loads(json_str)
                    except Exception as json_err:
                        logger.debug(f"Failed to parse probe JSON: {json_err}")
                else:
                    clean_lines.append(line)

            clean_stdout = "\n".join(clean_lines)

            # Fallback to parsing ASCII Spark table if probe didn't capture a variable
            if dataframe_result is None and clean_stdout:
                dataframe_result = parse_ascii_spark_table(clean_stdout)

            return {
                "job_id": job_id,
                "success": is_success,
                "exit_code": exit_code,
                "stdout": clean_stdout,
                "stderr": stderr_data or "",
                "execution_time_ms": elapsed_ms,
                "dataframe": dataframe_result,
                "error": None if is_success else clean_spark_error(stderr_data.strip() or f"Process exited with code {exit_code}"),
            }

        except subprocess.TimeoutExpired:
            logger.warning(f"Job {job_id} timed out after {timeout_seconds}s. Terminating process...")
            self.cancel_job(job_id)
            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
            return {
                "job_id": job_id,
                "success": False,
                "exit_code": -1,
                "stdout": "",
                "stderr": f"Execution timed out after {timeout_seconds} seconds.",
                "execution_time_ms": elapsed_ms,
                "dataframe": None,
                "error": f"Execution timed out after {timeout_seconds}s.",
            }

        except Exception as e:
            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.error(f"Error executing job {job_id}: {e}", exc_info=True)
            return {
                "job_id": job_id,
                "success": False,
                "exit_code": -1,
                "stdout": "",
                "stderr": str(e),
                "execution_time_ms": elapsed_ms,
                "dataframe": None,
                "error": str(e),
            }

        finally:
            with self._lock:
                self._active_processes.pop(job_id, None)
            
            # Clean up temporary script
            if job_file.exists():
                try:
                    job_file.unlink()
                except Exception as del_err:
                    logger.debug(f"Could not delete temporary job file {job_file}: {del_err}")

    def cancel_job(self, job_id: str) -> bool:
        """Cancels an active running subprocess and terminates all child processes."""
        with self._lock:
            process = self._active_processes.get(job_id)

        if not process:
            logger.warning(f"Job {job_id} not found or already finished.")
            return False

        logger.info(f"Cancelling job {job_id} (PID {process.pid})...")
        try:
            if os.name == "nt":
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(process.pid)],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=5,
                )
            else:
                process.terminate()
                try:
                    process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    process.kill()

            with self._lock:
                self._active_processes.pop(job_id, None)

            logger.info(f"Job {job_id} successfully cancelled.")
            return True
        except Exception as e:
            logger.error(f"Failed to cancel job {job_id}: {e}")
            try:
                process.kill()
                with self._lock:
                    self._active_processes.pop(job_id, None)
                return True
            except Exception:
                return False

    def register_dataset_views(self, spark) -> List[str]:
        """Discovers all uploaded and sample CSV datasets and registers them as temporary Spark SQL views."""
        registered = []
        seen_names = set()

        search_dirs = [
            settings.DATA_DIR / "uploads",
            settings.DATA_DIR / "samples",
            settings.DATA_DIR,
        ]

        for sdir in search_dirs:
            if not sdir.exists():
                continue
            for file_path in sdir.glob("*.csv"):
                if file_path.name.startswith("."):
                    continue

                # Clean view name (remove .csv, sanitize non-alphanumeric chars)
                stem = file_path.stem
                view_name = re.sub(r"[^a-zA-Z0-9_]", "_", stem).strip("_")
                if not view_name or view_name in seen_names:
                    continue

                try:
                    df = (
                        spark.read
                        .option("header", "true")
                        .option("inferSchema", "true")
                        .csv(str(file_path.resolve()))
                    )
                    df.createOrReplaceTempView(view_name)
                    registered.append(view_name)
                    seen_names.add(view_name)
                    logger.debug(f"Registered temporary Spark SQL view '{view_name}' from {file_path}")
                except Exception as reg_err:
                    logger.warning(f"Failed to register view for {file_path}: {reg_err}")

        return registered

    def execute_sql(self, sql: str, job_id: Optional[str] = None, timeout_seconds: int = 120) -> Dict[str, Any]:
        """Executes a Spark SQL query with lazy SparkSession, auto-registered dataset views, and schema extraction."""
        if not job_id:
            job_id = f"sql-{uuid.uuid4().hex[:8]}"

        start_time = time.perf_counter()
        registered_views = []

        try:
            with self.get_lazy_session("SparkCompilerSQLSession") as spark:
                # 1. Register temporary views for all available CSV datasets
                registered_views = self.register_dataset_views(spark)
                logger.info(f"Registered {len(registered_views)} Spark SQL views: {registered_views}")

                # 2. Execute SQL query
                result_df = spark.sql(sql)

                # 3. Capture schema, columns, and rows (up to MAX_RESULT_ROWS)
                schema = [{"name": str(f.name), "type": str(f.dataType)} for f in result_df.schema.fields]
                cols = [str(f.name) for f in result_df.schema.fields]
                collected_rows = [r.asDict() for r in result_df.limit(settings.MAX_RESULT_ROWS).collect()]
                row_count = result_df.count()

                elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)

                stdout_lines = [
                    "=== Spark SQL Query Succeeded ===",
                    f"Job ID: {job_id}",
                    f"Duration: {elapsed_ms} ms",
                    f"Matched Rows: {row_count} | Columns: {len(cols)}",
                    f"Registered Views: {', '.join(registered_views) if registered_views else 'None'}",
                    "",
                    "--- Query Executed ---",
                    sql.strip(),
                ]

                return {
                    "job_id": job_id,
                    "success": True,
                    "exit_code": 0,
                    "stdout": "\n".join(stdout_lines),
                    "stderr": "",
                    "execution_time_ms": elapsed_ms,
                    "dataframe": {
                        "columns": cols,
                        "schema": schema,
                        "rows": collected_rows,
                        "row_count": row_count,
                    },
                    "registered_views": registered_views,
                    "error": None,
                }

        except Exception as e:
            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
            err_msg = str(e)
            logger.error(f"Spark SQL execution failed for job {job_id}: {err_msg}")
            
            stdout_lines = [
                "=== Spark SQL Execution Failed ===",
                f"Job ID: {job_id}",
                f"Duration: {elapsed_ms} ms",
                f"Registered Views: {', '.join(registered_views) if registered_views else 'None'}",
                "",
                "--- Query ---",
                sql.strip(),
            ]

            clean_user_err = clean_spark_error(err_msg)

            return {
                "job_id": job_id,
                "success": False,
                "exit_code": 1,
                "stdout": "\n".join(stdout_lines),
                "stderr": err_msg,
                "execution_time_ms": elapsed_ms,
                "dataframe": None,
                "registered_views": registered_views,
                "error": clean_user_err,
            }


# Singleton service instance
spark_service = SparkService()
