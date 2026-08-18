from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.app.core.config import settings
from backend.app.core.logging_config import logger
from backend.app.api.v1.router import api_v1_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context.
    
    SparkSession is deliberately NOT initialized here to guarantee lazy on-demand
    resource allocation.
    """
    logger.info(f"Starting {settings.APP_NAME} in {settings.APP_ENV} mode...")
    logger.info(f"Configured JAVA_HOME: {settings.JAVA_HOME or 'Not configured / Auto-detect'}")
    logger.info(f"Configured SPARK_HOME: {settings.SPARK_HOME or 'Not configured / Auto-detect'}")
    yield
    logger.info(f"Shutting down {settings.APP_NAME}...")


def create_app() -> FastAPI:
    """Factory creating and configuring the FastAPI application."""
    app = FastAPI(
        title=settings.APP_NAME,
        version="1.0.0",
        description="High-performance backend compiler and execution bridge for Apache Spark.",
        lifespan=lifespan,
    )

    # CORS configuration
    cors_origins = settings.CORS_ORIGINS
    is_wildcard = "*" in cors_origins if isinstance(cors_origins, list) else cors_origins == "*"
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if is_wildcard else cors_origins,
        allow_credentials=False if is_wildcard else True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Mount API routers (both under /api and /api/v1 for clean versioning)
    app.include_router(api_v1_router, prefix="/api")
    app.include_router(api_v1_router, prefix="/api/v1")

    @app.get("/", tags=["Root"])
    async def root():
        return {
            "name": settings.APP_NAME,
            "version": "1.0.0",
            "environment": settings.APP_ENV,
            "docs_url": "/docs",
            "endpoints": {
                "health": "/api/health",
                "spark_status": "/api/spark/status",
                "spark_test": "/api/spark/test",
            },
        }

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.error(f"Unhandled exception at {request.url.path}: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": "An internal server error occurred.", "error": str(exc)},
        )

    return app


app = create_app()
