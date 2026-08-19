from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, ConfigDict
from backend.app.services.spark_service import spark_service
from backend.app.core.logging_config import logger

router = APIRouter(prefix="/spark", tags=["Spark Engine"])


class SparkStatusResponse(BaseModel):
    status: str = Field(..., description="'ready' or 'unavailable'")
    spark_available: bool = Field(..., description="Whether Spark is detected and usable")
    spark_version: Optional[str] = Field(None, description="Installed Spark version")
    spark_home: Optional[str] = Field(None, description="Path to SPARK_HOME")
    java_available: bool = Field(..., description="Whether Java runtime is detected")
    java_version: Optional[str] = Field(None, description="Installed Java version string")
    java_home: Optional[str] = Field(None, description="Path to JAVA_HOME")
    pyspark_available: bool = Field(..., description="Whether PySpark module is importable")
    message: str = Field(..., description="Human-readable status description")


class SparkTestRequest(BaseModel):
    records: Optional[List[Dict[str, Any]]] = Field(
        None,
        description="Optional custom records to process through PySpark DataFrame transformation"
    )


class SparkTestResponse(BaseModel):
    success: bool = Field(..., description="Whether the Spark operation succeeded")
    execution_time_ms: float = Field(..., description="Execution time in milliseconds")
    rows_processed: int = Field(..., description="Number of rows evaluated")
    spark_version: Optional[str] = Field(None, description="Spark version used during execution")
    app_name: Optional[str] = Field(None, description="Spark application name")
    results: List[Dict[str, Any]] = Field(default_factory=list, description="Output records from DataFrame")
    summary: Optional[Dict[str, Any]] = Field(None, description="Aggregated summary metrics")
    error: Optional[str] = Field(None, description="Error details if execution failed")


class SchemaField(BaseModel):
    name: str = Field(..., description="Column name")
    type: str = Field(..., description="Data type representation")


class DataFrameResult(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    columns: List[str] = Field(default_factory=list, description="List of column names")
    schema: List[SchemaField] = Field(default_factory=list, description="List of column schemas")
    rows: List[Dict[str, Any]] = Field(default_factory=list, description="Extracted records")
    row_count: int = Field(0, description="Total count of rows in the DataFrame")


class SparkExecuteRequest(BaseModel):
    code: str = Field(..., description="PySpark or Python source code to execute")
    job_id: Optional[str] = Field(None, description="Optional unique client-provided job ID")
    timeout_seconds: Optional[int] = Field(120, description="Maximum execution timeout in seconds")


class SparkSQLExecuteRequest(BaseModel):
    sql: str = Field(..., description="Spark SQL query string to execute")
    job_id: Optional[str] = Field(None, description="Optional unique client-provided job ID")
    timeout_seconds: Optional[int] = Field(120, description="Maximum execution timeout in seconds")


class SparkExecuteResponse(BaseModel):
    job_id: str = Field(..., description="Unique job execution identifier")
    success: bool = Field(..., description="Whether the process exited with code 0")
    exit_code: int = Field(..., description="Subprocess return code")
    stdout: str = Field(..., description="Standard output captured from the script")
    stderr: str = Field(..., description="Standard error captured from the script")
    execution_time_ms: float = Field(..., description="Total execution duration in milliseconds")
    dataframe: Optional[DataFrameResult] = Field(None, description="Extracted DataFrame result if produced")
    error: Optional[str] = Field(None, description="Error message if execution failed")


class SparkCancelResponse(BaseModel):
    job_id: str = Field(..., description="Job identifier")
    cancelled: bool = Field(..., description="Whether the job process was terminated")
    message: str = Field(..., description="Status message")


@router.get(
    "/status",
    response_model=SparkStatusResponse,
    summary="Get Spark & Java Environment Status",
    description="Inspects the local environment, verifies Spark & Java binaries, and reports runtime availability without starting a SparkContext."
)
async def get_spark_status():
    """Returns availability and version info for Spark and Java."""
    status_info = spark_service.get_status()
    return status_info


@router.post(
    "/test",
    response_model=SparkTestResponse,
    summary="Execute Lazy Spark DataFrame Test Job",
    description="Lazily starts a local SparkSession, runs DataFrame transformations, captures results, and reliably stops the session."
)
async def test_spark_execution(payload: Optional[SparkTestRequest] = None):
    """Executes a sample or custom DataFrame transformation on an on-demand SparkSession."""
    custom_records = payload.records if payload else None
    logger.info("Received request to execute Spark DataFrame test job.")
    
    result = spark_service.run_test_job(custom_records=custom_records)
    
    if not result.get("success"):
        logger.error(f"Spark execution failed: {result.get('error')}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Spark execution failed: {result.get('error')}",
        )
        
    return result


@router.post(
    "/execute",
    response_model=SparkExecuteResponse,
    summary="Execute Arbitrary PySpark Code Subprocess",
    description="Executes submitted Python / PySpark script in an isolated subprocess with active environment configuration and live stream capture."
)
async def execute_spark_code(payload: SparkExecuteRequest):
    """Spawns an isolated Python subprocess to execute the provided code and returns stdout, stderr, execution metrics, and structured DataFrame results."""
    logger.info(f"Received request to execute code for job {payload.job_id or 'auto-generated'}.")
    
    result = spark_service.execute_code(
        code=payload.code,
        job_id=payload.job_id,
        timeout_seconds=payload.timeout_seconds or 120,
    )
    return result


@router.post(
    "/sql/execute",
    response_model=SparkExecuteResponse,
    summary="Execute Spark SQL Query",
    description="Executes a Spark SQL query with auto-registered dataset temporary views and returns structured DataFrame results."
)
async def execute_spark_sql(payload: SparkSQLExecuteRequest):
    """Executes a Spark SQL query on the lazy SparkSession with auto-registered dataset views."""
    logger.info(f"Received request to execute Spark SQL for job {payload.job_id or 'auto-generated'}.")
    result = spark_service.execute_sql(
        sql=payload.sql,
        job_id=payload.job_id,
        timeout_seconds=payload.timeout_seconds or 120,
    )
    return result


@router.get("/debug")
async def debug_spark_runtime():
    """Diagnostic endpoint to inspect Java runtime, PySpark gateway launch output, and environment."""
    import os, sys, shutil, subprocess
    java_bin = shutil.which("java")
    java_ver = ""
    if java_bin:
        res = subprocess.run([java_bin, "-version"], capture_output=True, text=True)
        java_ver = res.stderr or res.stdout

    gateway_direct_out = ""
    gateway_direct_err = ""
    gateway_port = 0
    try:
        import os, subprocess, pyspark
        jars_dir = os.path.join(os.path.dirname(pyspark.__file__), "jars")
        cp = f"{jars_dir}/*"
        java_exe = os.path.join(os.environ.get("JAVA_HOME", "/usr/lib/jvm/java-17-openjdk-amd64"), "bin", "java")
        cmd = [
            java_exe,
            "-Xmx200m",
            "-XX:+UseSerialGC",
            "-cp",
            cp,
            "py4j.GatewayServer",
            "--die-on-broken-pipe",
            "0"
        ]
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        port_line = proc.stdout.readline()
        gateway_direct_out = f"Port line: {port_line.strip()}"
        if port_line.strip().isdigit():
            gateway_port = int(port_line.strip())
        proc.terminate()
    except Exception as e:
        gateway_direct_err = f"{type(e).__name__}: {e}"

    return {
        "java_bin": java_bin,
        "java_version_raw": java_ver,
        "JAVA_HOME": os.environ.get("JAVA_HOME"),
        "SPARK_HOME": os.environ.get("SPARK_HOME"),
        "SPARK_CONF_DIR": os.environ.get("SPARK_CONF_DIR"),
        "gateway_direct_out": gateway_direct_out,
        "gateway_direct_err": gateway_direct_err,
        "gateway_port": gateway_port,
    }


@router.post(
    "/cancel/{job_id}",
    response_model=SparkCancelResponse,
    summary="Cancel Active Spark Execution Subprocess",
    description="Terminates the running process tree for the specified job ID."
)
async def cancel_spark_job(job_id: str):
    """Cancels a currently active subprocess execution."""
    logger.info(f"Received request to cancel job {job_id}.")
    cancelled = spark_service.cancel_job(job_id)
    return {
        "job_id": job_id,
        "cancelled": cancelled,
        "message": "Job cancelled successfully." if cancelled else "Job not found or already finished.",
    }

