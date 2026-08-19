import os
import sys
from pathlib import Path
from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _detect_java_home() -> str:
    """Auto-detect JAVA_HOME on Windows and Linux containers if not explicitly set."""
    env_java = os.environ.get("JAVA_HOME")
    if env_java and Path(env_java).exists():
        return env_java
    
    # Check if java is in PATH
    import shutil
    java_path = shutil.which("java")
    if java_path:
        try:
            real_path = Path(java_path).resolve()
            if real_path.parent.name == "bin":
                candidate = real_path.parent.parent
                if (candidate / "bin" / "java").exists() or (candidate / "bin" / "java.exe").exists():
                    return str(candidate)
        except Exception:
            pass

    # Standard Linux & Windows JDK locations
    candidates = [
        Path("/usr/lib/jvm/java-17-openjdk-amd64"),
        Path("/usr/lib/jvm/java-17-openjdk-arm64"),
        Path("/usr/lib/jvm/default-java"),
        Path("/opt/java/openjdk"),
        Path(r"C:\Program Files\Eclipse Adoptium\jdk-17.0.20.8-hotspot"),
        Path(r"C:\Program Files\Eclipse Adoptium"),
        Path(r"C:\Program Files\Java"),
    ]
    for candidate in candidates:
        if candidate.is_dir():
            if (candidate / "bin" / "java").exists() or (candidate / "bin" / "java.exe").exists():
                return str(candidate)
            try:
                for sub in candidate.iterdir():
                    if sub.is_dir() and ((sub / "bin" / "java").exists() or (sub / "bin" / "java.exe").exists()):
                        return str(sub)
            except Exception:
                continue
    return ""


def _detect_spark_home() -> str:
    """Auto-detect SPARK_HOME only if a standalone Spark distribution is present.
    
    For pip-installed PySpark packages, SPARK_HOME should remain empty so PySpark
    launches GatewayServer directly without requiring external shell wrappers.
    """
    env_spark = os.environ.get("SPARK_HOME")
    if env_spark and Path(env_spark).exists() and "site-packages" not in env_spark:
        return env_spark

    candidates = [
        Path("/opt/spark"),
        Path("/usr/local/spark"),
        Path(r"C:\spark"),
        Path(r"D:\spark"),
        Path(r"C:\opt\spark"),
    ]
    for candidate in candidates:
        if candidate.is_dir():
            if (candidate / "bin" / "spark-submit").exists() or (candidate / "bin" / "spark-submit.cmd").exists():
                return str(candidate)
    return ""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    APP_NAME: str = "Spark Compiler API"
    APP_ENV: str = "production"
    DEBUG: bool = False
    PORT: int = 8000
    HOST: str = "0.0.0.0"
    API_PREFIX: str = "/api"

    # Security & Public Use Limits
    MAX_FILE_SIZE_BYTES: int = 25 * 1024 * 1024  # 25 MB max upload
    MAX_EXECUTION_TIMEOUT_SECONDS: int = 120     # 120s max execution for containerized Spark
    MAX_RESULT_ROWS: int = 10000                 # 10,000 max rows

    # CORS
    CORS_ORIGINS: Union[str, List[str]] = [
        "*",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            if v.strip() == "*":
                return ["*"]
            return [i.strip() for i in v.split(",") if i.strip()]
        return v

    # Spark & Java configuration
    JAVA_HOME: str = _detect_java_home()
    SPARK_HOME: str = _detect_spark_home()

    # Directories
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    DATA_DIR: Path = BASE_DIR.parent / "data"
    UPLOAD_DIR: Path = DATA_DIR / "uploads"
    SPARK_CONF_DIR: Path = BASE_DIR / "conf"


settings = Settings()

# Apply detected or configured paths to os.environ so child subprocesses and PySpark can locate them
if settings.JAVA_HOME and not os.environ.get("JAVA_HOME"):
    os.environ["JAVA_HOME"] = settings.JAVA_HOME

if settings.SPARK_HOME and not os.environ.get("SPARK_HOME"):
    os.environ["SPARK_HOME"] = settings.SPARK_HOME

if settings.SPARK_CONF_DIR.exists():
    os.environ["SPARK_CONF_DIR"] = str(settings.SPARK_CONF_DIR)

# Ensure PySpark workers bind to the current python executable
os.environ["PYSPARK_PYTHON"] = sys.executable
os.environ["PYSPARK_DRIVER_PYTHON"] = sys.executable
