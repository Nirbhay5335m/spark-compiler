from typing import List, Dict, Any, Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, status, Query
from pydantic import BaseModel, Field, ConfigDict
from backend.app.services.dataset_service import dataset_service
from backend.app.core.logging_config import logger

router = APIRouter(prefix="/datasets", tags=["Datasets"])


class SchemaField(BaseModel):
    name: str = Field(..., description="Column name")
    type: str = Field(..., description="Inferred column data type")


class DatasetItem(BaseModel):
    filename: str = Field(..., description="Name of the dataset file")
    path: str = Field(..., description="Relative storage path")
    size_bytes: int = Field(..., description="File size in bytes")
    columns: List[str] = Field(default_factory=list, description="List of column names")
    row_count: int = Field(0, description="Estimated or exact row count")
    modified_at: str = Field(..., description="ISO modification timestamp")
    is_sample: Optional[bool] = Field(False, description="Whether this is a built-in sample dataset")


class DatasetListResponse(BaseModel):
    datasets: List[DatasetItem] = Field(default_factory=list, description="List of datasets")
    total: int = Field(..., description="Total count of datasets")


class DatasetUploadResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    filename: str = Field(..., description="Saved sanitized filename")
    original_name: str = Field(..., description="Original client filename")
    path: str = Field(..., description="Relative storage path")
    size_bytes: int = Field(..., description="Saved file size in bytes")
    row_count: int = Field(..., description="Total rows extracted")
    columns: List[str] = Field(default_factory=list, description="Extracted column names")
    schema: List[SchemaField] = Field(default_factory=list, description="Inferred schema")
    uploaded_at: str = Field(..., description="ISO upload timestamp")


class DatasetPreviewResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    filename: str = Field(..., description="Dataset file name")
    path: str = Field(..., description="Storage path")
    size_bytes: int = Field(..., description="File size in bytes")
    total_rows: int = Field(..., description="Total rows in dataset")
    columns: List[str] = Field(default_factory=list, description="Column names")
    schema: List[SchemaField] = Field(default_factory=list, description="Inferred schema")
    rows: List[Dict[str, Any]] = Field(default_factory=list, description="Sample rows")
    partitions: int = Field(1, description="Calculated Spark partitions")


@router.post(
    "/upload",
    response_model=DatasetUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload CSV Dataset",
    description="Validates and securely uploads a CSV dataset to data/uploads, sanitizes filename against path traversal, and returns schema."
)
async def upload_dataset(file: UploadFile = File(...)):
    """Handles multipart CSV file upload with validation and security checks."""
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No filename provided in upload payload.",
        )

    logger.info(f"Incoming dataset upload: {file.filename} (content_type={file.content_type})")

    # Read file bytes
    try:
        content = await file.read()
    except Exception as e:
        logger.error(f"Failed to read uploaded file payload: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not read upload payload: {e}",
        )

    try:
        result = dataset_service.save_upload(raw_filename=file.filename, content=content)
        return result
    except ValueError as val_err:
        logger.warning(f"Validation failed for upload '{file.filename}': {val_err}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        )
    except Exception as err:
        logger.error(f"Error saving dataset '{file.filename}': {err}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error processing dataset upload: {err}",
        )


@router.get(
    "",
    response_model=DatasetListResponse,
    summary="List Available Datasets",
    description="Returns all uploaded and sample CSV datasets available in the workspace."
)
async def list_datasets():
    """Lists all available datasets with metadata."""
    datasets = dataset_service.list_datasets()
    return {
        "datasets": datasets,
        "total": len(datasets),
    }


@router.get(
    "/{filename}/preview",
    response_model=DatasetPreviewResponse,
    summary="Preview Dataset Schema and Rows",
    description="Reads dataset securely, infers column data types, and returns sample preview rows."
)
async def get_dataset_preview(
    filename: str,
    limit: int = Query(100, ge=1, le=1000, description="Max rows to preview")
):
    """Returns column schema and sample records for a dataset."""
    try:
        preview = dataset_service.get_preview(filename=filename, limit=limit)
        return preview
    except FileNotFoundError as fnf:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(fnf),
        )
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        )
    except Exception as err:
        logger.error(f"Error previewing dataset '{filename}': {err}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating preview for dataset '{filename}': {err}",
        )


class DatasetDeleteResponse(BaseModel):
    filename: str = Field(..., description="Deleted dataset filename")
    deleted: bool = Field(..., description="Whether deletion was successful")
    message: str = Field(..., description="Human-readable status message")


@router.delete(
    "/{filename}",
    response_model=DatasetDeleteResponse,
    summary="Delete Uploaded Dataset",
    description="Securely deletes an uploaded CSV dataset strictly from data/uploads directory, preventing deletion of sample datasets."
)
async def delete_dataset(filename: str):
    """Deletes an uploaded dataset from data/uploads."""
    logger.info(f"Received request to delete dataset '{filename}'.")
    try:
        res = dataset_service.delete_dataset(filename=filename)
        return res
    except PermissionError as perm_err:
        logger.warning(f"Permission denied deleting dataset '{filename}': {perm_err}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(perm_err),
        )
    except FileNotFoundError as fnf_err:
        logger.warning(f"Dataset '{filename}' not found for deletion: {fnf_err}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(fnf_err),
        )
    except ValueError as val_err:
        logger.warning(f"Validation error deleting dataset '{filename}': {val_err}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        )
    except Exception as err:
        logger.error(f"Internal server error deleting dataset '{filename}': {err}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete dataset '{filename}': {err}",
        )

