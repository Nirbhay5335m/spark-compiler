import time
from datetime import datetime, timezone
from fastapi import APIRouter
from backend.app.core.config import settings

router = APIRouter(tags=["Health"])

START_TIME = time.time()


@router.get("/health", summary="Service Health Check")
async def health_check():
    """Returns the operational health, version, and uptime of the Spark Compiler API."""
    uptime_seconds = round(time.time() - START_TIME, 2)
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "environment": settings.APP_ENV,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "uptime_seconds": uptime_seconds,
    }
