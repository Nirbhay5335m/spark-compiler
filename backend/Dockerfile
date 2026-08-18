# Production Dockerfile for Spark Compiler Backend (FastAPI + PySpark + Java 17)
FROM python:3.11-slim-bookworm

# Prevent interactive prompts during apt install
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Install Java 17 OpenJDK, procps, and essential utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    openjdk-17-jdk-headless \
    procps \
    curl \
    ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Configure Java Environment and Memory Limits for Containers
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
ENV PATH="${JAVA_HOME}/bin:${PATH}"
ENV _JAVA_OPTIONS="-Xms128m -Xmx384m -XX:+UseSerialGC"
ENV SPARK_DRIVER_MEMORY="350m"

# Set working directory
WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy backend application code
COPY backend/ /app/backend/

# Copy initial data directories and sample dataset
COPY data/ /app/data/
RUN mkdir -p /app/data/uploads /app/data/samples

# Environment and PySpark config
ENV APP_ENV=production
ENV DEBUG=false
ENV HOST=0.0.0.0
ENV PORT=8000
ENV PYSPARK_PYTHON=python3
ENV PYSPARK_DRIVER_PYTHON=python3

# Expose default port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://127.0.0.1:${PORT:-8000}/api/health || exit 1

# Start FastAPI production server with dynamic port binding
CMD uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}
