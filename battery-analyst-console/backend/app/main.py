from fastapi import FastAPI

from app.api import backtest, forecast, health, scenario, schedule

app = FastAPI(title="Battery Analyst Console API", version="0.1.0")

app.include_router(health.router)
app.include_router(forecast.router)
app.include_router(schedule.router)
app.include_router(scenario.router)
app.include_router(backtest.router)
