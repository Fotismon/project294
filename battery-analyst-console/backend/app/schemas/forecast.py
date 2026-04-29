from pydantic import BaseModel, ConfigDict, Field


class ForecastPoint(BaseModel):
    timestamp: str = Field(..., description="Forecast timestamp in ISO 8601 format.")
    predicted_price: float = Field(..., description="Predicted market price.")
    lower_bound: float = Field(..., description="Lower forecast confidence bound.")
    upper_bound: float = Field(..., description="Upper forecast confidence bound.")
    confidence: str = Field(..., description="Qualitative confidence level.")


class ForecastResponse(BaseModel):
    date: str = Field(..., description="Forecast date in YYYY-MM-DD format.")
    market: str = Field(..., description="Market represented by the forecast.")
    country: str = Field(..., description="Country or market zone code.")
    unit: str = Field(..., description="Price unit for forecast values.")
    points: list[ForecastPoint] = Field(..., description="Hourly forecast points.")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "date": "2026-04-29",
                "market": "day_ahead",
                "country": "GR",
                "unit": "EUR/MWh",
                "points": [
                    {
                        "timestamp": "2026-04-29T11:00:00+03:00",
                        "predicted_price": 38.4,
                        "lower_bound": 31.2,
                        "upper_bound": 45.9,
                        "confidence": "high",
                    }
                ],
            }
        }
    )
