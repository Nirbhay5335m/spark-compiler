import io
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.services.dataset_service import dataset_service, sanitize_filename

client = TestClient(app)


def test_sanitize_filename():
    """Verify filename sanitization prevents path traversal and cleans unsafe chars."""
    assert sanitize_filename("my_data.csv") == "my_data.csv"
    assert sanitize_filename("../../malicious.csv") == "malicious.csv"
    assert sanitize_filename("..\\..\\windows_evil.csv") == "windows_evil.csv"
    assert sanitize_filename("data (1) [final]!@#.csv") == "data__1___final.csv"

    with pytest.raises(ValueError):
        sanitize_filename("exploit.exe")

    with pytest.raises(ValueError):
        sanitize_filename("script.py")


def test_list_datasets():
    """Verify GET /api/datasets lists existing datasets including ecommerce.csv."""
    response = client.get("/api/datasets")
    assert response.status_code == 200
    data = response.json()
    assert "datasets" in data
    assert "total" in data
    assert data["total"] >= 1
    filenames = [d["filename"] for d in data["datasets"]]
    assert "ecommerce.csv" in filenames


def test_get_dataset_preview_ecommerce():
    """Verify GET /api/datasets/ecommerce.csv/preview returns schema and rows."""
    response = client.get("/api/datasets/ecommerce.csv/preview")
    assert response.status_code == 200
    data = response.json()
    assert data["filename"] == "ecommerce.csv"
    assert "columns" in data
    assert "order_id" in data["columns"]
    assert "customer_id" in data["columns"]
    assert "amount" in data["columns"]
    assert data["total_rows"] >= 6
    assert len(data["rows"]) >= 6

    # Verify schema typing
    schema_map = {f["name"]: f["type"] for f in data["schema"]}
    assert schema_map["order_id"] == "int"
    assert schema_map["amount"] in ("double", "int")
    assert schema_map["status"] == "string"


def test_get_dataset_preview_not_found():
    """Verify GET /api/datasets/non_existent_dataset.csv/preview returns 404."""
    response = client.get("/api/datasets/non_existent_dataset.csv/preview")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_dataset_upload_valid_csv():
    """Verify POST /api/datasets/upload successfully accepts and parses CSV upload."""
    csv_content = b"user_id,username,credits,is_premium\n1,alice,450.50,true\n2,bob,120.00,false\n3,charlie,890.25,true\n"
    files = {
        "file": ("test_users.csv", io.BytesIO(csv_content), "text/csv")
    }
    response = client.post("/api/datasets/upload", files=files)
    assert response.status_code == 201
    data = response.json()
    assert "test_users" in data["filename"]
    assert data["row_count"] == 3
    assert data["columns"] == ["user_id", "username", "credits", "is_premium"]
    assert len(data["schema"]) == 4

    # Verify preview works for newly uploaded dataset
    uploaded_name = data["filename"]
    preview_res = client.get(f"/api/datasets/{uploaded_name}/preview")
    assert preview_res.status_code == 200
    pdata = preview_res.json()
    assert pdata["total_rows"] == 3
    assert len(pdata["rows"]) == 3
    assert pdata["rows"][0]["username"] == "alice"


def test_dataset_upload_invalid_extension():
    """Verify POST /api/datasets/upload rejects non-CSV files."""
    files = {
        "file": ("malicious_script.py", io.BytesIO(b"import os; os.system('calc')"), "text/x-python")
    }
    response = client.post("/api/datasets/upload", files=files)
    assert response.status_code == 400
    assert "unsupported file format" in response.json()["detail"].lower()


def test_dataset_upload_empty_file():
    """Verify POST /api/datasets/upload rejects empty files."""
    files = {
        "file": ("empty.csv", io.BytesIO(b""), "text/csv")
    }
    response = client.post("/api/datasets/upload", files=files)
    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()


def test_dataset_security_path_traversal():
    """Verify path traversal filenames in upload are sanitized."""
    csv_content = b"id,name\n1,safe\n"
    files = {
        "file": ("../../traversal_attack.csv", io.BytesIO(csv_content), "text/csv")
    }
    response = client.post("/api/datasets/upload", files=files)
    assert response.status_code == 201
    data = response.json()
    assert ".." not in data["filename"]
    assert "/" not in data["filename"]
    assert "\\" not in data["filename"]

    # Clean up uploaded file via delete endpoint
    del_res = client.delete(f"/api/datasets/{data['filename']}")
    assert del_res.status_code == 200


def test_delete_uploaded_dataset_success():
    """Verify DELETE /api/datasets/{filename} deletes file and unregisters it."""
    # 1. Upload
    csv_content = b"k,v\n1,val1\n2,val2\n"
    files = {
        "file": ("to_be_deleted.csv", io.BytesIO(csv_content), "text/csv")
    }
    up_res = client.post("/api/datasets/upload", files=files)
    assert up_res.status_code == 201
    filename = up_res.json()["filename"]

    # 2. Delete
    del_res = client.delete(f"/api/datasets/{filename}")
    assert del_res.status_code == 200
    del_data = del_res.json()
    assert del_data["filename"] == filename
    assert del_data["deleted"] is True

    # 3. Preview should now be 404
    preview_res = client.get(f"/api/datasets/{filename}/preview")
    assert preview_res.status_code == 404

    # 4. Listing should no longer contain this file
    list_res = client.get("/api/datasets")
    assert list_res.status_code == 200
    listed_names = [d["filename"] for d in list_res.json()["datasets"]]
    assert filename not in listed_names


def test_delete_nonexistent_dataset():
    """Verify DELETE /api/datasets/{filename} returns 404 for nonexistent file."""
    response = client.delete("/api/datasets/non_existent_random_dataset_9999.csv")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_delete_sample_dataset_forbidden():
    """Verify DELETE /api/datasets/ecommerce.csv returns 403 (sample dataset protected)."""
    response = client.delete("/api/datasets/ecommerce.csv")
    assert response.status_code == 403
    assert "built-in sample dataset" in response.json()["detail"].lower()


def test_delete_path_traversal_rejected():
    """Verify path traversal sequences in DELETE filename are rejected with 400."""
    response = client.delete("/api/datasets/..%2F..%2Fsecret.csv")
    assert response.status_code in (400, 404)

