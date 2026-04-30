from pydantic import BaseModel, ConfigDict, Field


class ShapFeatureContribution(BaseModel):
    feature: str = Field(..., description="Feature name contributing to this forecast slot.")
    contribution_eur_per_mwh: float = Field(
        ...,
        description="SHAP contribution in EUR/MWh for the forecast slot.",
    )
    direction: str = Field(
        ...,
        description="Whether this feature pushes the forecast up or down.",
    )


class ShapSlotExplanation(BaseModel):
    source: str = Field(..., description="Source of the SHAP explanation.")
    explanation_date: str = Field(
        ...,
        description="Historical SHAP date used for this explanation.",
    )
    confidence_score: float | None = Field(
        None,
        description="SHAP file confidence score for the explanation row.",
    )
    actual_price_eur_per_mwh: float | None = Field(
        None,
        description="Historical actual price from the SHAP row, if available.",
    )
    model_price_eur_per_mwh: float | None = Field(
        None,
        description="Historical model P50 price from the SHAP row, if available.",
    )
    top_contributions: list[ShapFeatureContribution] = Field(
        default_factory=list,
        description="Top feature contributions for the slot.",
    )


class ForecastPoint(BaseModel):
    timestamp: str = Field(..., description="Forecast timestamp in ISO 8601 format.")
    predicted_price: float = Field(..., description="Predicted market price.")
    lower_bound: float = Field(..., description="Lower forecast confidence bound.")
    upper_bound: float = Field(..., description="Upper forecast confidence bound.")
    confidence: str = Field(..., description="Qualitative confidence level.")
    confidence_score: float = Field(
        ...,
        ge=0,
        le=1,
        description="Normalized confidence score from 0 to 1.",
    )
    arbitrage_signal: float = Field(
        ...,
        description="Forecast price premium over the daily minimum P50 price.",
    )
    risk_adjusted_price: float = Field(
        ...,
        description="Confidence-weighted price between the P50 and lower confidence bound.",
    )
    shap_explanation: ShapSlotExplanation | None = Field(
        None,
        description="Top SHAP feature contributions explaining this forecast slot.",
    )


class ForecastResponse(BaseModel):
    date: str = Field(..., description="Forecast date in YYYY-MM-DD format.")
    market: str = Field(..., description="Market represented by the forecast.")
    country: str = Field(..., description="Country or market zone code.")
    unit: str = Field(..., description="Price unit for forecast values.")
    points: list[ForecastPoint] = Field(..., description="Forecast points at 15-min resolution.")
    avg_band_width_eur: float = Field(
        default=25.0,
        description="Average P05–P95 band width across all slots (EUR/MWh). "
        "Pass this as forecast_uncertainty_width in /schedule requests.",
    )
    provenance: dict[str, str] = Field(
        default_factory=lambda: {
            "source": "open_meteo_weather_plus_lightgbm_price_forecast",
            "weather_source": "Open-Meteo",
            "weather_api_role": "Weather features only; not direct price data.",
            "price_model": "LightGBM DAM price forecast",
            "price_output": "Predicted day-ahead market price forecast",
            "price_unit": "EUR/MWh",
        },
        description="Forecast provenance and unit metadata.",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "date": "2026-04-29",
                "market": "day_ahead",
                "country": "GR",
                "unit": "EUR/MWh",
                "provenance": {
                    "source": "open_meteo_weather_plus_lightgbm_price_forecast",
                    "weather_source": "Open-Meteo",
                    "weather_api_role": "Weather features only; not direct price data.",
                    "price_model": "LightGBM DAM price forecast",
                    "price_output": "Predicted day-ahead market price forecast",
                    "price_unit": "EUR/MWh",
                },
                "points": [
                    {
                        "timestamp": "2026-04-29T11:00:00+03:00",
                        "predicted_price": 38.4,
                        "lower_bound": 31.2,
                        "upper_bound": 45.9,
                        "confidence": "high",
                        "confidence_score": 0.82,
                        "arbitrage_signal": 12.4,
                        "risk_adjusted_price": 37.1,
                        "shap_explanation": {
                            "source": "historical_shap_per_slot",
                            "explanation_date": "2026-04-29",
                            "confidence_score": 0.82,
                            "actual_price_eur_per_mwh": 39.1,
                            "model_price_eur_per_mwh": 38.4,
                            "top_contributions": [
                                {
                                    "feature": "mcp_lag_1d",
                                    "contribution_eur_per_mwh": -7.2,
                                    "direction": "down",
                                }
                            ],
                        },
                    }
                ],
            }
        }
    )
