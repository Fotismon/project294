from pydantic import BaseModel, ConfigDict, Field

from app.schemas.schedule import BatteryProfile


class BacktestRequest(BaseModel):
    start_date: str = Field(..., description="Backtest start date in YYYY-MM-DD format.")
    end_date: str = Field(..., description="Backtest end date in YYYY-MM-DD format.")
    battery: BatteryProfile = Field(..., description="Battery profile to backtest.")
    strategy: str = Field("spread_capture", description="Strategy name to backtest.")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "start_date": "2026-04-01",
                "end_date": "2026-04-30",
                "battery": {
                    "battery_id": "battery-001",
                    "capacity_kwh": 1000.0,
                    "max_charge_kw": 500.0,
                    "max_discharge_kw": 500.0,
                    "current_soc": 0.5,
                },
                "strategy": "spread_capture",
            }
        }
    )


class BacktestSummary(BaseModel):
    total_days: int = Field(..., description="Total days included in the mock backtest.")
    profitable_days: int = Field(..., description="Days with positive expected value.")
    skipped_days: int = Field(..., description="Days skipped by the mocked strategy.")
    total_expected_value_eur: float = Field(..., description="Total mock expected value in EUR.")
    average_daily_value_eur: float = Field(..., description="Average mock daily value in EUR.")


class BacktestResponse(BaseModel):
    start_date: str = Field(..., description="Backtest start date in YYYY-MM-DD format.")
    end_date: str = Field(..., description="Backtest end date in YYYY-MM-DD format.")
    strategy: str = Field(..., description="Backtested strategy name.")
    summary: BacktestSummary = Field(..., description="Mock backtest summary.")
    notes: list[str] = Field(..., description="Notes about the mock backtest response.")
