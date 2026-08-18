import os
import re
import csv
import io
import time
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime
from backend.app.core.config import settings
from backend.app.core.logging_config import logger


MAX_FILE_SIZE_BYTES = settings.MAX_FILE_SIZE_BYTES  # 25 MB max public upload
ALLOWED_EXTENSIONS = {".csv"}


def sanitize_filename(filename: str) -> str:
    """Sanitizes filename and prevents directory traversal attacks."""
    # Strip path separators and null bytes
    cleaned = os.path.basename(filename.strip().replace("\x00", ""))
    
    # Remove directory navigation sequences
    cleaned = cleaned.replace("..", "").replace("/", "").replace("\\", "")
    
    # Separate name and ext
    name_part, ext_part = os.path.splitext(cleaned)
    
    # Sanitize characters in name
    name_part = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", name_part).strip("._")
    if not name_part:
        name_part = f"dataset_{int(time.time())}"
        
    ext_part = ext_part.lower()
    if ext_part not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Unsupported file format '{ext_part}'. Only CSV files ({', '.join(ALLOWED_EXTENSIONS)}) are supported.")
        
    return f"{name_part}{ext_part}"


def infer_column_type(values: List[str]) -> str:
    """Infers simplified data type for a list of string values."""
    non_empty = [v.strip() for v in values if v is not None and v.strip() != ""]
    if not non_empty:
        return "string"

    # Check boolean
    if all(v.lower() in ("true", "false", "1", "0", "yes", "no") for v in non_empty):
        return "boolean"

    # Check integer
    is_int = True
    for v in non_empty:
        try:
            int(v)
        except ValueError:
            is_int = False
            break
    if is_int:
        return "int"

    # Check float / double
    is_float = True
    for v in non_empty:
        try:
            float(v)
        except ValueError:
            is_float = False
            break
    if is_float:
        return "double"

    return "string"


class DatasetService:
    """Service layer for dataset management, secure uploads, listing, and schema preview."""

    def __init__(self):
        self.data_dir = settings.DATA_DIR
        self.uploads_dir = self.data_dir / "uploads"
        self.samples_dir = self.data_dir / "samples"
        
        self.uploads_dir.mkdir(parents=True, exist_ok=True)
        self.samples_dir.mkdir(parents=True, exist_ok=True)

    def _resolve_dataset_path(self, filename: str) -> Optional[Path]:
        """Safely locates a dataset file across uploads, samples, or root data directory."""
        # Sanitize filename query
        safe_name = os.path.basename(filename).replace("..", "").replace("/", "").replace("\\", "")
        if not safe_name:
            return None

        # Check candidate locations
        candidates = [
            self.uploads_dir / safe_name,
            self.samples_dir / safe_name,
            self.data_dir / safe_name,
        ]

        for candidate in candidates:
            # Ensure path is strictly contained within DATA_DIR
            try:
                resolved = candidate.resolve()
                if resolved.is_file() and str(resolved).startswith(str(self.data_dir.resolve())):
                    return resolved
            except Exception:
                continue

        return None

    def save_upload(self, raw_filename: str, content: bytes) -> Dict[str, Any]:
        """Validates and securely saves an uploaded dataset file."""
        if len(content) > MAX_FILE_SIZE_BYTES:
            raise ValueError(f"File size ({len(content)} bytes) exceeds maximum limit of {MAX_FILE_SIZE_BYTES // (1024*1024)} MB.")

        if len(content) == 0:
            raise ValueError("Uploaded file is empty.")

        safe_name = sanitize_filename(raw_filename)
        target_path = self.uploads_dir / safe_name

        # If file with same name exists, generate a timestamped variant
        if target_path.exists():
            stem, ext = os.path.splitext(safe_name)
            safe_name = f"{stem}_{int(time.time())}{ext}"
            target_path = self.uploads_dir / safe_name

        try:
            target_path.write_bytes(content)
        except Exception as e:
            logger.error(f"Failed to write dataset file {target_path}: {e}")
            raise RuntimeError(f"Could not write file to storage: {e}")

        # Quick parse to get column headers and row count
        preview = self.get_preview(safe_name, limit=5)
        
        logger.info(f"Dataset '{safe_name}' ({len(content)} bytes) successfully uploaded to {target_path}.")
        return {
            "filename": safe_name,
            "original_name": raw_filename,
            "path": f"data/uploads/{safe_name}",
            "size_bytes": len(content),
            "row_count": preview["total_rows"],
            "columns": preview["columns"],
            "schema": preview["schema"],
            "uploaded_at": datetime.now().isoformat(),
        }

    def list_datasets(self) -> List[Dict[str, Any]]:
        """Lists all available datasets across uploads and sample directories."""
        datasets = []
        seen_filenames = set()

        search_dirs = [self.uploads_dir, self.samples_dir, self.data_dir]
        for sdir in search_dirs:
            if not sdir.exists():
                continue
            for file_path in sdir.glob("*.csv"):
                if file_path.name in seen_filenames or file_path.name.startswith("."):
                    continue
                
                try:
                    stat = file_path.stat()
                    # Relative display path
                    try:
                        rel_path = file_path.relative_to(settings.BASE_DIR.parent).as_posix()
                    except Exception:
                        rel_path = f"data/{file_path.name}"

                    # Sample quick stats
                    line_count = 0
                    cols = []
                    try:
                        with open(file_path, mode="r", encoding="utf-8", errors="ignore") as f:
                            reader = csv.reader(f)
                            first_row = next(reader, None)
                            if first_row:
                                cols = [c.strip() for c in first_row if c.strip()]
                            # Count remaining non-empty lines
                            for row in reader:
                                if row:
                                    line_count += 1
                    except Exception:
                        pass

                    datasets.append({
                        "filename": file_path.name,
                        "path": rel_path,
                        "size_bytes": stat.st_size,
                        "columns": cols,
                        "row_count": line_count,
                        "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                        "is_sample": "samples" in file_path.parts,
                    })
                    seen_filenames.add(file_path.name)
                except Exception as e:
                    logger.debug(f"Error inspecting dataset file {file_path}: {e}")

        # Sort by uploaded/modified timestamp descending
        datasets.sort(key=lambda d: d.get("modified_at", ""), reverse=True)
        return datasets

    def get_preview(self, filename: str, limit: int = 100) -> Dict[str, Any]:
        """Reads CSV content, extracts schema with inferred data types, and returns sample rows."""
        file_path = self._resolve_dataset_path(filename)
        if not file_path or not file_path.exists():
            raise FileNotFoundError(f"Dataset '{filename}' was not found.")

        rows: List[Dict[str, Any]] = []
        columns: List[str] = []
        col_values: Dict[str, List[str]] = {}
        total_rows = 0

        try:
            with open(file_path, mode="r", encoding="utf-8", errors="ignore") as f:
                reader = csv.DictReader(f)
                columns = reader.fieldnames or []
                columns = [c.strip() for c in columns if c.strip()]
                col_values = {c: [] for c in columns}

                for row in reader:
                    total_rows += 1
                    clean_row = {}
                    for col in columns:
                        raw_val = row.get(col, "")
                        val_str = raw_val.strip() if isinstance(raw_val, str) else str(raw_val)
                        if total_rows <= limit:
                            col_values[col].append(val_str)
                            # Basic typing for row preview
                            if val_str.lower() == "true":
                                clean_row[col] = True
                            elif val_str.lower() == "false":
                                clean_row[col] = False
                            elif val_str.isdigit():
                                clean_row[col] = int(val_str)
                            else:
                                try:
                                    clean_row[col] = float(val_str)
                                except ValueError:
                                    clean_row[col] = val_str
                    if len(rows) < limit:
                        rows.append(clean_row)

        except Exception as e:
            logger.error(f"Failed to read dataset preview for {filename}: {e}")
            raise RuntimeError(f"Error reading dataset file: {e}")

        # Infer schema data types
        schema = []
        for col in columns:
            inferred_type = infer_column_type(col_values.get(col, []))
            schema.append({"name": col, "type": inferred_type})

        stat = file_path.stat()
        return {
            "filename": file_path.name,
            "path": f"data/uploads/{file_path.name}" if "uploads" in file_path.parts else f"data/{file_path.name}",
            "size_bytes": stat.st_size,
            "total_rows": total_rows,
            "columns": columns,
            "schema": schema,
            "rows": rows,
            "partitions": 1,
        }

    def delete_dataset(self, filename: str) -> Dict[str, Any]:
        """Securely deletes a dataset file strictly from data/uploads directory.
        
        Validates against path traversal and prevents deletion of sample datasets.
        """
        if not filename or ".." in filename or "/" in filename or "\\" in filename:
            raise ValueError(f"Invalid filename '{filename}'. Path traversal sequences are not allowed.")

        safe_name = os.path.basename(filename.strip().replace("\x00", ""))
        target_path = self.uploads_dir / safe_name

        try:
            resolved = target_path.resolve()
            if not str(resolved).startswith(str(self.uploads_dir.resolve())):
                raise ValueError("Access denied: path traversal detected.")
        except Exception as e:
            raise ValueError(f"Invalid dataset path resolution: {e}")

        # Check if file exists in uploads
        if not target_path.exists() or not target_path.is_file():
            # Check if it is a built-in sample file
            sample_path = self.samples_dir / safe_name
            if sample_path.exists():
                raise PermissionError(f"Dataset '{safe_name}' is a built-in sample dataset and cannot be deleted.")
            raise FileNotFoundError(f"Dataset '{safe_name}' not found in uploads directory.")

        try:
            target_path.unlink()
            logger.info(f"Dataset '{safe_name}' successfully deleted from {target_path}.")
        except Exception as del_err:
            logger.error(f"Error unlinking dataset file {target_path}: {del_err}")
            raise RuntimeError(f"Could not delete dataset file: {del_err}")

        return {
            "filename": safe_name,
            "deleted": True,
            "message": f"Dataset '{safe_name}' was deleted successfully.",
        }


# Singleton service
dataset_service = DatasetService()
