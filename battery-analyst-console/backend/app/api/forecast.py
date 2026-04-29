from datetime import date as _date, timedelta

from fastapi import APIRouter, HTTPException, Query

from app.forecasting.forecast_data import (
    build_inference_features,
    fetch_weather_forecast,
    load_feature_store,
)
from app.forecasting.forecast_engine import run_forecast
from app.schemas.forecast import ForecastResponse

router = APIRouter(tags=["forecast"])


@router.get("/forecast", response_model=ForecastResponse)
def get_forecast(
    date: str = Query(
        default=None,
        description="Target date in YYYY-MM-DD format. Defaults to tomorrow.",
    )
) -> ForecastResponse:
    if date is None:
        date = (_date.today() + timedelta(days=1)).isoformat()

    try:
        store = load_feature_store()
        weather = fetch_weather_forecast(date)
        X = build_inference_features(date, store, weather)
        return run_forecast(date, X)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Forecast error: {exc}") from exc
