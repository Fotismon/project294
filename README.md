# Hellenic Batteries

Hellenic Batteries is a battery analytics and dispatch decision-support project. The main application lives in `battery-analyst-console` and combines a FastAPI backend with a Next.js TypeScript frontend for exploring market forecasts, battery fleet status, scheduling recommendations, scenarios, alerts, and backtests.

## Project Overview

The console is designed to help operators turn electricity price forecasts into practical battery actions. It does more than show a price curve: it weighs expected value against operational constraints such as state of charge, round-trip efficiency, temperature risk, degradation cost, forecast confidence, and fleet availability.

Core capabilities include:

- Market forecast views with uncertainty bands and price intervals.
- Battery fleet overview with per-asset status, SoC, temperature, stress, and recommended action.
- Scheduling logic for charge, discharge, idle, watch, and no-action decisions.
- Scenario analysis for testing assumptions such as risk appetite, efficiency, degradation cost, and temperature policy.
- Alerts and diagnostics that explain operational risks and schedule tradeoffs.
- Backtesting support when historical market price data is available.

## Repository Structure

```text
battery-analyst-console/
  backend/     FastAPI API, forecasting, scheduling, fleet, and backtest logic
  frontend/    Next.js dashboard UI built with TypeScript, React, Tailwind, and Recharts
  data/        Shared data area
  docs/        Project documentation
```

## Backend

The backend exposes API routes for health checks, forecasts, fleet data, schedules, scenarios, and backtests.

Run it with:

```bash
cd battery-analyst-console/backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

By default, the API runs at:

```text
http://127.0.0.1:8000
```

## Frontend

The frontend is the operator dashboard. It can call the backend when an API URL is configured and can also display demo or fallback data for presentation flows.

Run it with:

```bash
cd battery-analyst-console/frontend
npm install
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000 npm run dev
```

Then open:

```text
http://localhost:3000
```

## Demo

The demo flow is documented in:

```text
battery-analyst-console/frontend/DEMO.md
```

It walks through the main story of the product: using forecasts to create risk-aware battery recommendations, inspecting fleet-level and asset-level decisions, comparing profit and battery stress, running scenarios, reviewing alerts, and showing when doing nothing is the correct operational choice.

## Notes

This is an MVP-style analytics console. Some parts use demo or local model data, and richer results depend on available historical market data and trained forecast artifacts under the backend model/data folders.
