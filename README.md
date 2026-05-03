# Hellenic Batteries

Battery analytics and dispatch decision-support project for Greek electricity market operators. The application forecasts day-ahead electricity prices, optimizes BESS charge/discharge schedules, and presents fleet-wide recommendations through a real-time dashboard.

The main application lives in [`battery-analyst-console/`](battery-analyst-console/).

---

## Repository Structure

```
hellenic-batteries/
├── battery-analyst-console/   Main application (backend + frontend)
└── README.md
```

See [`battery-analyst-console/README.md`](battery-analyst-console/README.md) for the full project overview, quick-start instructions, and architecture details.

---

## Quick Start

```bash
cd battery-analyst-console
make install
make run-backend     # http://127.0.0.1:8000
make run-frontend    # http://localhost:3000
```
