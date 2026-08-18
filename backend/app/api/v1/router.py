from fastapi import APIRouter
from backend.app.api.v1.health import router as health_router
from backend.app.api.v1.spark import router as spark_router
from backend.app.api.v1.datasets import router as datasets_router

api_v1_router = APIRouter()

api_v1_router.include_router(health_router)
api_v1_router.include_router(spark_router)
api_v1_router.include_router(datasets_router)
