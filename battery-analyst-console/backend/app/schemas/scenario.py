from pydantic import BaseModel, ConfigDict, Field


class ScenarioOverrideRequest(BaseModel):
    date: str = Field(..., description="Scenario target date in YYYY-MM-DD format.")
    profile_name: str = Field("balanced", description="Base battery operating profile name.")
    prices: list[float] = Field(
        ...,
        min_length=96,
        max_length=96,
        description="Forecast prices for 96 15-minute intervals.",
    )
    temperatures: list[float] | None = Field(
        None,
        description="Optional temperatures for 96 15-minute intervals.",
    )
    round_trip_efficiency: float | None = Field(
        None,
        gt=0,
        le=1,
        description="Optional round-trip efficiency override.",
    )
    duration_hours: float | None = Field(
        None,
        gt=0,
        description="Optional battery duration override in hours.",
    )
    max_cycles_per_day: int | None = Field(
        None,
        ge=1,
        description="Optional maximum cycles per day override.",
    )
    degradation_cost_eur_per_mwh: float | None = Field(
        None,
        ge=0,
        description="Optional degradation cost override in EUR/MWh.",
    )
    temperature_policy: str = Field(
        "normal",
        description="Temperature policy: relaxed, normal, or strict.",
    )
    risk_appetite: str = Field(
        "balanced",
        description="Risk appetite: conservative, balanced, or aggressive.",
    )
    forecast_confidence: str = Field("medium", description="Forecast confidence label.")
    market_volatility: str = Field("medium", description="Market volatility label.")
    forecast_uncertainty_width: float | None = Field(
        None,
        ge=0,
        description="Optional average forecast band width in EUR/MWh.",
    )
    data_quality_level: str = Field("medium", description="Input data quality label.")
    minimum_margin_eur_per_mwh: float = Field(
        2.0,
        ge=0,
        description="Base minimum margin before risk-appetite adjustment.",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "date": "2026-04-29",
                "profile_name": "balanced",
                "prices": [80.0] * 44 + [35.0] * 8 + [80.0] * 28 + [120.0] * 8 + [80.0] * 8,
                "temperatures": [25.0] * 80 + [31.0] * 8 + [25.0] * 8,
                "round_trip_efficiency": 0.9,
                "duration_hours": 3,
                "max_cycles_per_day": 1,
                "degradation_cost_eur_per_mwh": 5,
                "temperature_policy": "normal",
                "risk_appetite": "balanced",
                "forecast_confidence": "medium_high",
                "market_volatility": "medium",
                "forecast_uncertainty_width": 25.0,
                "data_quality_level": "medium",
                "minimum_margin_eur_per_mwh": 2.0,
            }
        }
    )
