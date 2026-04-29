from pydantic import BaseModel, ConfigDict, Field


class BatteryProfile(BaseModel):
    battery_id: str = Field(..., description="Unique identifier for the battery asset.")
    capacity_kwh: float = Field(..., description="Usable battery capacity in kilowatt-hours.")
    max_charge_kw: float = Field(..., description="Maximum charge power in kilowatts.")
    max_discharge_kw: float = Field(..., description="Maximum discharge power in kilowatts.")
    min_soc: float = Field(0.1, description="Minimum allowed state of charge as a fraction.")
    max_soc: float = Field(0.9, description="Maximum allowed state of charge as a fraction.")
    current_soc: float = Field(0.5, description="Current state of charge as a fraction.")
    round_trip_efficiency: float = Field(
        0.88,
        description="Round-trip efficiency applied to spread and value calculations.",
    )
    max_cycles_per_day: int = Field(1, description="Maximum allowed cycles per day.")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "battery_id": "battery-001",
                "capacity_kwh": 1000.0,
                "max_charge_kw": 500.0,
                "max_discharge_kw": 500.0,
                "min_soc": 0.1,
                "max_soc": 0.9,
                "current_soc": 0.5,
                "round_trip_efficiency": 0.88,
                "max_cycles_per_day": 1,
            }
        }
    )


class ScheduleRequest(BaseModel):
    date: str = Field(..., description="Schedule date in YYYY-MM-DD format.")
    profile_name: str = Field("balanced", description="Battery operating profile name.")
    prices: list[float] | None = Field(
        None,
        min_length=96,
        max_length=96,
        description="Optional forecast prices for 96 15-minute intervals.",
    )
    temperatures: list[float] | None = Field(
        None,
        description="Optional temperatures for 96 15-minute intervals.",
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
        description="Minimum required margin for economic filtering.",
    )
    battery: BatteryProfile | None = Field(
        None,
        description="Legacy battery profile payload accepted for backward compatibility.",
    )
    strategy: str = Field("spread_capture", description="Scheduling strategy name.")
    market: str = Field("day_ahead", description="Market used for the schedule.")
    country: str = Field("GR", description="Country or market zone code.")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "date": "2026-04-29",
                "profile_name": "balanced",
                "prices": [80.0] * 44 + [35.0] * 8 + [80.0] * 28 + [120.0] * 8 + [80.0] * 8,
                "temperatures": [25.0] * 80 + [31.0] * 8 + [25.0] * 8,
                "forecast_confidence": "medium_high",
                "market_volatility": "medium",
                "forecast_uncertainty_width": 25.0,
                "data_quality_level": "medium",
                "minimum_margin_eur_per_mwh": 2.0,
                "strategy": "spread_capture",
                "market": "day_ahead",
                "country": "GR",
            }
        }
    )


class Window(BaseModel):
    start: str = Field(..., description="Window start time in HH:MM format.")
    end: str = Field(..., description="Window end time in HH:MM format.")
    avg_price: float = Field(..., description="Average market price during the window.")


class SoCFeasibility(BaseModel):
    feasible: bool = Field(..., description="Whether the schedule respects SoC constraints.")
    min_soc: float = Field(..., description="Minimum SoC limit used in the feasibility check.")
    max_soc: float = Field(..., description="Maximum SoC limit used in the feasibility check.")
    start_soc: float = Field(..., description="Expected SoC at the start of the schedule.")
    end_soc: float = Field(..., description="Expected SoC at the end of the schedule.")
    violations: list[str] = Field(
        default_factory=list,
        description="Human-readable SoC constraint violations.",
    )


class BatteryStress(BaseModel):
    level: str = Field(..., description="Qualitative battery stress level.")
    score: int = Field(..., description="Battery stress score for the proposed schedule.")
    reasons: list[str] = Field(
        default_factory=list,
        description="Reasons contributing to the battery stress level.",
    )


class PhysicalConstraints(BaseModel):
    duration_ok: bool = Field(..., description="Whether charge and discharge durations are valid.")
    cycle_limit_ok: bool = Field(..., description="Whether the schedule respects cycle limits.")
    temperature_ok: bool = Field(..., description="Whether temperature constraints are acceptable.")
    round_trip_efficiency_applied: bool = Field(
        ...,
        description="Whether round-trip efficiency was applied.",
    )
    rapid_switching_avoided: bool = Field(
        ...,
        description="Whether rapid charge/discharge switching was avoided.",
    )


class Alert(BaseModel):
    level: str = Field(..., description="Alert severity level.")
    message: str = Field(..., description="Human-readable alert message.")
    metric: str | None = Field(None, description="Optional metric associated with the alert.")


class AlternativeSchedule(BaseModel):
    label: str = Field(..., description="Short label for the alternative schedule.")
    charge_window: Window | None = Field(None, description="Alternative charge window.")
    discharge_window: Window | None = Field(None, description="Alternative discharge window.")
    expected_value_range_eur: list[float] = Field(
        default_factory=list,
        description="Expected value range for the alternative schedule in EUR.",
    )
    reason: str = Field(..., description="Reason this alternative is relevant.")


class ScheduleResponse(BaseModel):
    date: str = Field(..., description="Schedule date in YYYY-MM-DD format.")
    decision: str = Field(..., description="Recommended action for the schedule.")
    confidence: str = Field(..., description="Confidence level for the recommendation.")
    charge_window: Window = Field(..., description="Recommended charging window.")
    discharge_window: Window = Field(..., description="Recommended discharging window.")
    spread_after_efficiency: float = Field(
        ...,
        description="Estimated price spread after applying battery efficiency.",
    )
    expected_value_range_eur: list[float] = Field(
        ...,
        description="Expected schedule value range in EUR.",
    )
    soc_feasibility: SoCFeasibility = Field(..., description="SoC feasibility assessment.")
    battery_stress: BatteryStress = Field(..., description="Battery stress assessment.")
    physical_constraints: PhysicalConstraints = Field(
        ...,
        description="Physical constraint checks for the schedule.",
    )
    alternatives: list[AlternativeSchedule] = Field(
        default_factory=list,
        description="Alternative schedules considered.",
    )
    alerts: list[Alert] = Field(default_factory=list, description="Alerts for the schedule.")
    explanation: list[str] = Field(
        default_factory=list,
        description="Human-readable explanation of the recommendation.",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "date": "2026-04-29",
                "decision": "execute_with_caution",
                "confidence": "medium_high",
                "charge_window": {
                    "start": "11:00",
                    "end": "13:00",
                    "avg_price": 38.4,
                },
                "discharge_window": {
                    "start": "20:00",
                    "end": "22:00",
                    "avg_price": 116.8,
                },
                "spread_after_efficiency": 71.6,
                "expected_value_range_eur": [120, 180],
                "soc_feasibility": {
                    "feasible": True,
                    "min_soc": 0.1,
                    "max_soc": 0.9,
                    "start_soc": 0.5,
                    "end_soc": 0.49,
                    "violations": [],
                },
                "battery_stress": {
                    "level": "medium",
                    "score": 42,
                    "reasons": [
                        "one cycle only",
                        "temperature risk during discharge window",
                        "no rapid switching",
                    ],
                },
                "physical_constraints": {
                    "duration_ok": True,
                    "cycle_limit_ok": True,
                    "temperature_ok": True,
                    "round_trip_efficiency_applied": True,
                    "rapid_switching_avoided": True,
                },
                "alternatives": [],
                "alerts": [],
                "explanation": [],
            }
        }
    )
