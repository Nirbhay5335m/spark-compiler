import time
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.services.spark_service import spark_service

client = TestClient(app)


def test_spark_service_status_detection():
    """Verify that SparkService detects Java and Spark availability accurately."""
    status = spark_service.get_status()
    assert isinstance(status, dict)
    assert "status" in status
    assert "spark_available" in status
    assert "java_available" in status
    assert status["spark_available"] is True
    assert status["java_available"] is True
    assert status["status"] == "ready"


def test_api_spark_status():
    """Verify GET /api/spark/status returns valid JSON structure and ready status."""
    response = client.get("/api/spark/status")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert data["spark_available"] is True
    assert data["java_available"] is True
    assert "spark_version" in data
    assert "java_version" in data


def test_api_spark_test_execution_default():
    """Verify POST /api/spark/test lazily runs a DataFrame transformation and stops cleanly."""
    response = client.post("/api/spark/test", json={})
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["rows_processed"] == 5
    assert data["execution_time_ms"] > 0
    assert len(data["results"]) == 5
    assert "summary" in data
    assert data["summary"]["total_modules"] == 5
    first_result = data["results"][0]
    assert "module_upper" in first_result
    assert first_result["module_upper"] == first_result["module"].upper()


def test_api_spark_test_execution_custom_data():
    """Verify POST /api/spark/test handles custom records properly."""
    custom_records = [
        {"id": 1, "module": "CustomAST", "status": "active", "tokens_processed": 5000},
        {"id": 2, "module": "CustomEmitter", "status": "pending", "tokens_processed": 100},
    ]
    response = client.post("/api/spark/test", json={"records": custom_records})
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["rows_processed"] == 2
    assert len(data["results"]) == 2
    assert data["results"][0]["module_upper"] == "CUSTOMAST"
    assert data["results"][0]["is_high_throughput"] is True
    assert data["results"][1]["is_high_throughput"] is False


def test_api_spark_execute_simple_python():
    """Verify POST /api/spark/execute runs Python code in a subprocess and captures stdout."""
    code = "print('SPARK_COMPILER_EXECUTION_TEST_OK')\nx = 10 + 20\nprint(f'RESULT: {x}')"
    response = client.post("/api/spark/execute", json={"code": code, "job_id": "test-job-simple"})
    assert response.status_code == 200
    data = response.json()
    assert data["job_id"] == "test-job-simple"
    assert data["success"] is True
    assert data["exit_code"] == 0
    assert "SPARK_COMPILER_EXECUTION_TEST_OK" in data["stdout"]
    assert "RESULT: 30" in data["stdout"]
    assert data["execution_time_ms"] > 0


def test_api_spark_execute_runtime_error():
    """Verify POST /api/spark/execute captures runtime exceptions and stderr properly."""
    code = "print('BEFORE_ERROR')\nraise ValueError('Simulated Spark Compiler Error')"
    response = client.post("/api/spark/execute", json={"code": code})
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is False
    assert data["exit_code"] != 0
    assert "BEFORE_ERROR" in data["stdout"]
    assert "ValueError: Simulated Spark Compiler Error" in data["stderr"]
    assert data["error"] is not None


def test_api_spark_execute_pyspark():
    """Verify POST /api/spark/execute runs real PySpark code with local SparkSession."""
    code = """
from pyspark.sql import SparkSession
spark = SparkSession.builder.master("local[1]").appName("ExecuteTest").config("spark.ui.enabled", "false").getOrCreate()
df = spark.createDataFrame([(1, "SparkCore"), (2, "PySpark")], ["id", "component"])
df.show()
spark.stop()
print("PYSPARK_SUBPROCESS_SUCCESS")
"""
    response = client.post("/api/spark/execute", json={"code": code, "timeout_seconds": 120})
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["exit_code"] == 0
    assert "PYSPARK_SUBPROCESS_SUCCESS" in data["stdout"]
    assert "SparkCore" in data["stdout"]
    # Verify dataframe extracted via show() or probe
    assert data["dataframe"] is not None
    assert "id" in data["dataframe"]["columns"]
    assert "component" in data["dataframe"]["columns"]
    assert data["dataframe"]["row_count"] == 2


def test_api_spark_execute_returns_dataframe_result():
    """Verify that a script creating a DataFrame returns structured columns, rows, and schema."""
    code = """
from pyspark.sql import SparkSession
spark = SparkSession.builder.master("local[1]").appName("DFExtractTest").config("spark.ui.enabled", "false").getOrCreate()
result = spark.createDataFrame([
    (101, "Lexer", "active", 1420),
    (102, "Parser", "active", 980),
], ["module_id", "module_name", "status", "tokens"])
"""
    response = client.post("/api/spark/execute", json={"code": code, "timeout_seconds": 120})
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    df_data = data["dataframe"]
    assert df_data is not None
    assert df_data["columns"] == ["module_id", "module_name", "status", "tokens"]
    assert df_data["row_count"] == 2
    assert len(df_data["rows"]) == 2
    assert df_data["rows"][0]["module_name"] == "Lexer"
    assert len(df_data["schema"]) == 4


def test_api_spark_cancel():
    """Verify POST /api/spark/cancel/{job_id} responds properly for completed/missing job."""
    response = client.post("/api/spark/cancel/non-existent-job-999")
    assert response.status_code == 200
    data = response.json()
    assert data["job_id"] == "non-existent-job-999"
    assert data["cancelled"] is False


def test_api_spark_sql_execute_success():
    """Verify POST /api/spark/sql/execute queries auto-registered ecommerce view."""
    query = "SELECT product_category, COUNT(*) as orders, ROUND(SUM(amount), 2) as total_rev FROM ecommerce GROUP BY product_category ORDER BY total_rev DESC"
    response = client.post("/api/spark/sql/execute", json={"sql": query, "job_id": "test-sql-job-1"})
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["exit_code"] == 0
    assert data["job_id"] == "test-sql-job-1"
    assert data["dataframe"] is not None
    assert "product_category" in data["dataframe"]["columns"]
    assert "orders" in data["dataframe"]["columns"]
    assert "total_rev" in data["dataframe"]["columns"]
    assert data["dataframe"]["row_count"] >= 4
    assert "ecommerce" in data["stdout"]


def test_api_spark_sql_execute_error():
    """Verify POST /api/spark/sql/execute returns formatted error for invalid table/syntax."""
    query = "SELECT * FROM non_existent_table_999"
    response = client.post("/api/spark/sql/execute", json={"sql": query})
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is False
    assert data["exit_code"] == 1
    assert data["dataframe"] is None
    assert len(data["stderr"]) > 0 or data["error"] is not None
