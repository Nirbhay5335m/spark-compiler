# Spark Compiler

Enterprise Distributed Query & Execution Engine Monorepo.

## Project Structure

```
spark-compiler/
├── backend/                  # Python FastAPI Backend
│   ├── app/
│   │   ├── api/              # API Route Handlers (/api/health, /api/spark/status, /api/spark/test)
│   │   ├── core/             # Configuration & Logging
│   │   ├── services/         # Lazy Spark Service Layer & Execution Engine
│   │   └── main.py           # FastAPI Application Entrypoint
│   ├── tests/                # Automated Test Suite (pytest)
│   ├── requirements.txt      # Python Dependencies
│   └── .env.example          # Environment Configuration Template
├── frontend/                 # React 19 + TypeScript + Vite Dashboard
│   ├── src/
│   │   ├── services/         # Typed API Client (/api/health, /api/spark/status)
│   │   ├── App.tsx           # Health & Environment Dashboard
│   │   ├── main.tsx          # Application Root Mount
│   │   └── index.css         # Design System & Styling
│   ├── package.json          # Node Dependencies & Scripts
│   └── vite.config.ts        # Vite Configuration & Backend Proxy
├── data/                     # Ingestion & Dataset Storage
│   ├── uploads/              # Uploaded raw datasets
│   └── samples/              # Sample transformation fixtures
├── .gitignore                # Comprehensive Git Ignore Rules
├── package.json              # Monorepo Scripts
└── README.md                 # Project Documentation
```

## Prerequisites

- **Python**: 3.10+ (Python 3.13 supported)
- **Node.js**: 20+ (Node 24 supported)
- **Java**: OpenJDK 17 / Temurin 17
- **Apache Spark**: Apache Spark 4.x / 3.5.x

## Quickstart

### 1. Backend Setup

```powershell
# Navigate to workspace root
cd "d:\spark compiler"

# Create and activate Python virtual environment
python -m venv backend/.venv
.\backend\.venv\Scripts\Activate.ps1

# Install required dependencies
pip install -r backend/requirements.txt

# Run backend test suite
pytest backend/tests -v

# Start FastAPI server
uvicorn backend.app.main:app --reload --port 8000
```

The backend will be available at `http://127.0.0.1:8000`.
OpenAPI documentation is available at `http://127.0.0.1:8000/docs`.

### 2. Frontend Setup

```powershell
# Navigate to frontend
cd "d:\spark compiler\frontend"

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```

The frontend dashboard will be available at `http://localhost:5173`.

## API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Service uptime, health status, and metadata. |
| `GET` | `/api/spark/status` | Reports Spark, Java, PySpark detection and readiness without starting a session. |
| `POST` | `/api/spark/test` | Lazily creates a SparkSession, executes DataFrame operations, returns output, and cleanly terminates the session. |
