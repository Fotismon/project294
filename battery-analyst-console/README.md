# Battery Analyst Console

Dispatch decision-support console for Greek BESS (Battery Energy Storage System) operators. Combines a LightGBM price forecaster and a MILP dispatch optimizer with a real-time fleet dashboard.

---

## Quick Start

```bash
# Install everything
make install

# Start the backend (http://127.0.0.1:8000)
make run-backend

# In a separate terminal — start the frontend (http://localhost:3000)
make run-frontend
```

Or manually:

```bash
# Backend
cd backend && pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Frontend
cd frontend && npm install && npm run dev
```

---

## Repository Structure

```
battery-analyst-console/
├── backend/              FastAPI service — forecasting, optimization, fleet, backtest
│   ├── app/              Application code (api/, schemas/, scheduling/, forecasting/, …)
│   ├── models/           Pre-trained LightGBM .pkl files and feature metadata
│   ├── data/             Historical HENEX DAM market prices (source-controlled)
│   ├── cache/            Generated outputs — forecast cache, SHAP data (gitignored)
│   ├── tests/            pytest test scaffold
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/             Next.js 14 TypeScript dashboard
│   ├── app/              Next.js App Router pages and global styles
│   ├── components/       Dashboard panels (38) and UI primitives (7)
│   ├── lib/api.ts        Centralised HTTP client
│   ├── types/api.ts      TypeScript contracts for all API shapes
│   ├── Dockerfile
│   └── package.json
├── notebooks/            Jupyter notebooks — price forecast model training and EDA
├── scripts/
│   └── examples/         Standalone validation scripts for scheduling and diagnostics
├── data/                 Shared data area for additional market CSVs
├── docs/                 Project documentation
├── docker-compose.yml    Bring up both services with one command
├── Makefile              Common developer commands
└── .env.example          Environment variable reference
```

See [`backend/README.md`](backend/README.md) and [`frontend/README.md`](frontend/README.md) for full detail on each service.

---

## Environment Variables

Copy `.env.example` and adjust as needed:

```bash
cp .env.example .env.local
```

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKEND_HOST` | `127.0.0.1` | Backend bind host |
| `BACKEND_PORT` | `8000` | Backend bind port |
| `NEXT_PUBLIC_API_BASE_URL` | `http://127.0.0.1:8000` | Frontend → backend URL (set in `frontend/.env.local`) |

---

## Docker

```bash
docker compose up
```

Starts the backend on port `8000` and the frontend on port `3000`. The `backend/models/`, `backend/data/`, and `backend/cache/` directories are mounted as bind volumes so model files are never baked into the image.

---

## What the Console Does

Given a target date the system:

1. **Forecasts** day-ahead electricity prices across all 96 × 15-minute intervals using three LightGBM quantile models (p05 / p50 / p95) and explains each slot via SHAP feature contributions.
2. **Optimizes** a charge/discharge schedule against the forecast using a multi-stage pipeline — candidate window generation → physical / economic / SoC filtering → MILP solver — subject to battery operating constraints (power, capacity, efficiency, degradation cost, temperature, cycle limits).
3. **Recommends** an action: `execute`, `execute_with_caution`, `watch`, or `hold`, with a scored breakdown of spread quality, forecast confidence, and battery stress.
4. **Explains** the decision through alerts, diagnostics (EFC, ramp-rate violations, SoC trajectory), and fleet-level EUR value estimates.
5. **Backtests** past decisions against realized market prices to assess optimizer performance.
6. **Compares scenarios** with custom price assumptions, profile overrides, and risk appetite settings.

---

## Battery Profiles

| Profile | Power | Capacity | Cycles/day | Use case |
|---------|-------|----------|------------|----------|
| `conservative` | 80 MW | 320 MWh | 1 | Low degradation, wide SoC buffer |
| `balanced` | 100 MW | 300 MWh | 1 | Standard Greek BESS operation |
| `aggressive` | 120 MW | 300 MWh | 2 | High-frequency, tight margins |
| `greece_100mw_300mwh` | 100 MW | 300 MWh | 1.5 | Regulatory-compliant Greek profile |

---

## Make Targets

```bash
make install          # pip install + npm install
make run-backend      # uvicorn with hot reload
make run-frontend     # next dev
make test             # pytest backend/tests/
make run-examples     # run scheduling validation scripts
make lint-backend     # ruff check
make lint-frontend    # next lint
```

---

## Demo

The presentation flow is documented in [`frontend/DEMO.md`](frontend/DEMO.md).
