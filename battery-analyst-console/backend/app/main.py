from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import backtest, fleet, forecast, health, scenario, schedule

app = FastAPI(title="Battery Analyst Console API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003",
        "http://localhost:3004",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
        "http://127.0.0.1:3003",
        "http://127.0.0.1:3004",
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(fleet.router)
app.include_router(forecast.router)
app.include_router(schedule.router)
app.include_router(scenario.router)
app.include_router(backtest.router)
