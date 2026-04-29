from pydantic import BaseModel, ConfigDict, Field

from app.schemas.schedule import ScheduleResponse


class BacktestRequest(BaseModel):
    date: str = Field(..., description="Historical backtest date in YYYY-MM-DD format.")
    profile_name: str = Field("balanced", description="Battery operating profile name.")
    lookback_days: int = Field(
        7,
        ge=1,
        description="Number of prior available days to use for forecast generation.",
    )
    forecast_method: str = Field(
        "lookback_average",
        description="Forecast method used for the backtest.",
    )
    market_volatility: str = Field("medium", description="Market volatility label.")
    data_quality_level: str = Field("medium", description="Input data quality label.")
    minimum_margin_eur_per_mwh: float = Field(
        2.0,
        ge=0,
        description="Minimum required margin for economic filtering.",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "date": "2026-04-29",
                "profile_name": "balanced",
                "lookback_days": 7,
                "forecast_method": "lookback_average",
                "market_volatility": "medium",
                "data_quality_level": "medium",
                "minimum_margin_eur_per_mwh": 2.0,
            }
        }
    )


class BacktestRealizedWindow(BaseModel):
    start: str = Field(..., description="Window start time in HH:MM format.")
    end: str = Field(..., description="Window end time in HH:MM format.")
    forecast_avg_price: float = Field(..., description="Forecast average price for the window.")
    realized_avg_price: float = Field(..., description="Actual realized average price.")


class BacktestEconomicResult(BaseModel):
    forecast_spread_after_efficiency: float = Field(
        ...,
        description="Forecast spread after efficiency from the schedule response.",
    )
    realized_spread_after_efficiency: float = Field(
        ...,
        description="Realized spread after applying round-trip efficiency.",
    )
    forecast_expected_value_range_eur: list[float] = Field(
        ...,
        description="Forecast expected value range in EUR.",
    )
    realized_value_eur: float = Field(..., description="Estimated realized value in EUR.")
    value_error_eur: float = Field(
        ...,
        description="Realized value minus forecast midpoint value in EUR.",
    )


class BacktestResponse(BaseModel):
    date: str = Field(..., description="Historical backtest date in YYYY-MM-DD format.")
    profile_name: str = Field(..., description="Battery operating profile name.")
    forecast_method: str = Field(..., description="Forecast method used for the backtest.")
    decision: str = Field(..., description="Scheduler decision for the generated forecast.")
    confidence: str = Field(..., description="Scheduler confidence for the generated forecast.")
    charge_window: BacktestRealizedWindow | None = Field(
        None,
        description="Recommended charge window with forecast and realized prices.",
    )
    discharge_window: BacktestRealizedWindow | None = Field(
        None,
        description="Recommended discharge window with forecast and realized prices.",
    )
    economic_result: BacktestEconomicResult | None = Field(
        None,
        description="Forecast versus realized economic result.",
    )
    schedule_response: ScheduleResponse | None = Field(
        None,
        description="Underlying schedule response generated from the forecast.",
    )
    explanation: list[str] = Field(
        default_factory=list,
        description="Human-readable backtest explanation.",
    )
    warnings: list[str] = Field(
        default_factory=list,
        description="Backtest warnings and MVP limitations.",
    )
