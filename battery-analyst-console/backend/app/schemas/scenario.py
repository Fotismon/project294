from pydantic import BaseModel, ConfigDict, Field

from app.schemas.schedule import BatteryProfile


class ScenarioRequest(BaseModel):
    date: str = Field(..., description="Scenario date in YYYY-MM-DD format.")
    battery: BatteryProfile = Field(..., description="Battery profile to analyze.")
    price_multiplier: float = Field(1.0, description="Multiplier applied to mock prices.")
    efficiency_override: float | None = Field(
        None,
        description="Optional round-trip efficiency override for the scenario.",
    )
    notes: str | None = Field(None, description="Optional scenario notes.")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "date": "2026-04-29",
                "battery": {
                    "battery_id": "battery-001",
                    "capacity_kwh": 1000.0,
                    "max_charge_kw": 500.0,
                    "max_discharge_kw": 500.0,
                    "current_soc": 0.5,
                },
                "price_multiplier": 1.15,
                "efficiency_override": 0.9,
                "notes": "Higher volatility case",
            }
        }
    )


class ScenarioResponse(BaseModel):
    date: str = Field(..., description="Scenario date in YYYY-MM-DD format.")
    scenario_name: str = Field(..., description="Name of the mocked scenario.")
    decision: str = Field(..., description="Mock recommendation for the scenario.")
    expected_value_range_eur: list[float] = Field(
        ...,
        description="Mock expected value range in EUR.",
    )
    key_changes: list[str] = Field(..., description="Key scenario changes applied.")
    explanation: list[str] = Field(..., description="Human-readable scenario explanation.")
