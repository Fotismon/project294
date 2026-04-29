from fastapi import APIRouter

from app.schemas.forecast import ForecastPoint, ForecastResponse

router = APIRouter(tags=["forecast"])


@router.get("/forecast", response_model=ForecastResponse)
def get_forecast() -> ForecastResponse:
    return ForecastResponse(
        date="2026-04-29",
        market="day_ahead",
        country="GR",
        unit="EUR/MWh",
        points=[
            ForecastPoint(
                timestamp="2026-04-29T00:00:00+03:00",
                predicted_price=72.4,
                lower_bound=64.1,
                upper_bound=81.8,
                confidence="medium",
            ),
            ForecastPoint(
                timestamp="2026-04-29T06:00:00+03:00",
                predicted_price=54.2,
                lower_bound=47.5,
                upper_bound=62.0,
                confidence="medium_high",
            ),
            ForecastPoint(
                timestamp="2026-04-29T11:00:00+03:00",
                predicted_price=38.4,
                lower_bound=31.2,
                upper_bound=45.9,
                confidence="high",
            ),
            ForecastPoint(
                timestamp="2026-04-29T17:00:00+03:00",
                predicted_price=94.7,
                lower_bound=82.0,
                upper_bound=108.5,
                confidence="medium",
            ),
            ForecastPoint(
                timestamp="2026-04-29T20:00:00+03:00",
                predicted_price=116.8,
                lower_bound=101.3,
                upper_bound=132.6,
                confidence="medium_high",
            ),
            ForecastPoint(
                timestamp="2026-04-29T23:00:00+03:00",
                predicted_price=83.6,
                lower_bound=73.8,
                upper_bound=95.1,
                confidence="medium",
            ),
        ],
    )
