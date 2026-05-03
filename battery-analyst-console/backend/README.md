# Backend — Battery Analyst Console API

FastAPI service that provides price forecasting, battery dispatch optimization, fleet management, scenario analysis, and backtesting for Greek BESS (Battery Energy Storage System) assets.

---

## Quick Start

```bash
# From battery-analyst-console/backend/
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Or from the project root:

```bash
make run-backend
```

The API is available at `http://127.0.0.1:8000`. Interactive docs at `http://127.0.0.1:8000/docs`.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness check — returns service name and version |
| `GET` | `/fleet` | Returns all 10 fleet assets with current SoC, temperature, and summary totals |
| `GET` | `/forecast` | Runs LightGBM price forecast for a given date (defaults to tomorrow); returns 96 price quantiles (p05/p50/p95) with SHAP explanations |
| `POST` | `/schedule` | Runs the full dispatch optimization for a battery profile and forecast date |
| `POST` | `/scenario` | Same as `/schedule` but accepts custom forecast prices, profile overrides, and risk settings |
| `GET` | `/backtest/coverage` | Returns the date range covered by the market price dataset |
| `POST` | `/backtest` | Simulates optimizer performance against historical realized market prices |

### Example: run a schedule

```bash
curl -X POST http://127.0.0.1:8000/schedule \
  -H "Content-Type: application/json" \
  -d '{"profile": "balanced", "date": "2024-06-15"}'
```

---

## Project Structure

```
backend/
├── app/
│   ├── main.py               FastAPI app — CORS config, router registration
│   ├── api/                  One router file per endpoint
│   │   ├── health.py
│   │   ├── fleet.py
│   │   ├── forecast.py
│   │   ├── schedule.py
│   │   ├── scenario.py
│   │   └── backtest.py
│   ├── schemas/              Pydantic request/response contracts
│   │   ├── forecast.py
│   │   ├── schedule.py
│   │   ├── fleet.py
│   │   ├── scenario.py
│   │   └── backtest.py
│   ├── battery/
│   │   └── profiles.py       Four predefined battery operating profiles
│   ├── fleet/
│   │   └── config.py         10 hardcoded Greek BESS fleet assets
│   ├── data/
│   │   └── market_prices.py  CSV loader for historical DAM market prices
│   ├── forecasting/
│   │   ├── forecast_engine.py  Loads LightGBM models, runs inference, generates SHAP
│   │   └── forecast_data.py    Feature engineering — feature store + weather fetch
│   └── scheduling/           Core optimization pipeline (~20 modules)
│       ├── schedule_runner.py    Orchestrates the full pipeline
│       ├── milp.py               PuLP-based MILP dispatch solver
│       ├── windows.py            Candidate window generation (96 × 15-min intervals)
│       ├── pairing.py            Charge → discharge window pairing
│       ├── constraints.py        Physical constraint filtering
│       ├── economics.py          Hurdle cost / profitability filtering
│       ├── soc.py                State-of-charge feasibility filtering
│       ├── scoring.py            Composite score (spread, confidence, stress)
│       ├── recommendation.py     Final execute / caution / watch / hold decision
│       ├── alerts.py             Analyst-facing alert generation
│       ├── diagnostics.py        Dispatch metrics (EFC, SoC violations, ramp-rate)
│       └── ...                   (backtest_runner, scenario_runner, value_diagnostics, etc.)
├── models/                   Pre-trained ML model artifacts (not modified at runtime)
│   ├── lgbm_p05.pkl          LightGBM 5th-percentile quantile model
│   ├── lgbm_p50.pkl          LightGBM median quantile model
│   ├── lgbm_p95.pkl          LightGBM 95th-percentile quantile model
│   ├── feature_list.json     Feature names for model inference
│   └── regime_boundaries.json  Market regime thresholds (q33/q67)
├── data/
│   └── henex_dam_results.csv   Historical HENEX DAM market prices + weather features
├── cache/                    Generated outputs (gitignored)
│   ├── forecast_tomorrow.csv   Cached next-day forecast
│   └── shap_per_slot.csv       SHAP feature importance per 15-min slot
├── tests/                    Test scaffold (pytest)
│   └── test_scheduling/
└── requirements.txt
```

---

## Scheduling Pipeline

The `/schedule` endpoint runs through a multi-stage pipeline:

```
Candidate Windows (windows.py)
        ↓
Window Pairing (pairing.py)         charge before discharge, rest enforced
        ↓
Physical Filtering (constraints.py) duration, cycle count, temperature
        ↓
Economic Filtering (economics.py)   discharge > charge cost + degradation
        ↓
SoC Filtering (soc.py)              SoC bounds over 96 intervals
        ↓
Scoring (scoring.py)                spread quality × confidence × stress
        ↓
MILP Optimization (milp.py)         PuLP solver — SoC, power, ramp, degradation
        ↓
Recommendation (recommendation.py)  execute / execute_with_caution / watch / hold
        ↓
Alerts & Diagnostics                EFC, forecast uncertainty, value range
```

---

## Battery Profiles

Four built-in profiles (`battery/profiles.py`):

| Profile | Power | Capacity | Cycles/day | Efficiency | Use case |
|---------|-------|----------|------------|------------|----------|
| `conservative` | 80 MW | 320 MWh | 1 | 88% | Low degradation, wide SoC buffer |
| `balanced` | 100 MW | 300 MWh | 1 | 90% | Standard Greek BESS operation |
| `aggressive` | 120 MW | 300 MWh | 2 | 91% | High-frequency trading, tight margins |
| `greece_100mw_300mwh` | 100 MW | 300 MWh | 1.5 | 85% | Regulatory-compliant Greek profile |

Pass the profile name as `"profile"` in any `/schedule` or `/scenario` request body.

---

## Forecasting

The `/forecast` endpoint uses three pre-trained LightGBM quantile regression models to predict day-ahead electricity prices across all 96 × 15-minute intervals of the target date. Each response includes:

- `p05`, `p50`, `p95` price quantiles per interval
- SHAP feature contributions explaining the p50 prediction per slot
- Market regime classification (low / medium / high volatility)

Models are loaded once at startup from `backend/models/`. If the `.pkl` files are missing, the endpoint returns HTTP 503.

---

## Environment Variables

No environment variables are required for local development. Copy `.env.example` from the project root to `.env` if you need to override defaults:

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKEND_HOST` | `127.0.0.1` | Host to bind uvicorn |
| `BACKEND_PORT` | `8000` | Port to bind uvicorn |
| `MARKET_PRICES_CSV` | _(auto-detected)_ | Path to a custom market price CSV |

---

## Running Tests

```bash
# From backend/
python -m pytest tests/ -v
```

Validation scripts (not formal tests) are in `../scripts/examples/` and can be run individually:

```bash
python ../scripts/examples/milp_example.py
python ../scripts/examples/diagnostics_example.py
```

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `fastapi` | Web framework |
| `uvicorn[standard]` | ASGI server |
| `pydantic` | Request/response validation |
| `pandas` / `numpy` | Data manipulation |
| `lightgbm` | Price forecasting (quantile regression) |
| `pulp` | MILP dispatch optimization |
| `requests` | External weather API calls |
| `python-dotenv` | Optional `.env` file loading |
