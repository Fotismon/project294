from pydantic import BaseModel, Field


class FleetAsset(BaseModel):
    id: str
    name: str
    site: str
    status: str
    capacity_mwh: float
    power_mw: float
    soc: float
    temperature_c: float
    auto_action: str = "idle"
    selected_action: str = "auto"
    expected_value_eur: list[float] = Field(default_factory=lambda: [0.0, 0.0])
    stress_level: str = "low"
    constraint_warnings: list[str] = Field(default_factory=list)
    profile_name: str


class FleetSummary(BaseModel):
    total_assets: int
    available_assets: int
    total_capacity_mwh: float
    total_power_mw: float
    average_soc: float
    forecast_driven_action: str
    assets_charging: int
    assets_discharging: int
    assets_idle: int
    expected_value_eur: list[float]


class FleetResponse(BaseModel):
    assets: list[FleetAsset]
    summary: FleetSummary

