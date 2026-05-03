from pydantic import BaseModel, Field


class BatteryOperatingProfile(BaseModel):
    """Configuration for a predefined battery operating strategy."""

    name: str = Field(..., description="Profile name.")
    power_mw: float = Field(..., description="Maximum charge or discharge power in MW.")
    capacity_mwh: float = Field(..., description="Usable battery capacity in MWh.")
    duration_hours: float = Field(..., description="Nominal full-power duration in hours.")
    round_trip_efficiency: float = Field(..., description="Round-trip efficiency fraction.")
    max_cycles_per_day: float = Field(..., description="Maximum allowed cycles per day.")
    soc_min: float = Field(..., description="Minimum allowed state of charge fraction.")
    soc_max: float = Field(..., description="Maximum allowed state of charge fraction.")
    initial_soc: float = Field(..., description="Default starting state of charge fraction.")
    target_terminal_soc: float = Field(..., description="Target final state of charge fraction.")
    min_action_duration_minutes: int = Field(..., description="Minimum action duration.")
    max_action_duration_minutes: int = Field(..., description="Maximum action duration.")
    min_rest_between_actions_minutes: int = Field(
        ...,
        description="Minimum rest time between charge or discharge actions.",
    )
    temperature_warning_c: float = Field(..., description="Temperature warning threshold in C.")
    temperature_avoid_c: float = Field(..., description="Temperature avoidance threshold in C.")
    degradation_cost_eur_per_mwh: float = Field(
        ...,
        description="Estimated degradation cost per MWh in EUR.",
    )
    auxiliary_load_percent: float = Field(
        0.0,
        ge=0,
        description=(
            "Auxiliary load as a fraction of rated power, used for parasitic loads "
            "such as cooling."
        ),
    )
    ramp_rate_mw_per_interval: float | None = Field(
        None,
        gt=0,
        description="Maximum allowed change in net power per forecast interval in MW.",
    )
    grid_connection_limit_mw: float | None = Field(
        None,
        gt=0,
        description="Maximum grid interconnection power limit in MW.",
    )


BATTERY_PROFILES: dict[str, BatteryOperatingProfile] = {
    "conservative": BatteryOperatingProfile(
        name="conservative",
        power_mw=80,
        capacity_mwh=320,
        duration_hours=4,
        round_trip_efficiency=0.88,
        max_cycles_per_day=1,
        soc_min=0.15,
        soc_max=0.85,
        initial_soc=0.5,
        target_terminal_soc=0.15,
        min_action_duration_minutes=90,
        max_action_duration_minutes=240,
        min_rest_between_actions_minutes=90,
        temperature_warning_c=28,
        temperature_avoid_c=38,
        degradation_cost_eur_per_mwh=7,
    ),
    "balanced": BatteryOperatingProfile(
        name="balanced",
        power_mw=100,
        capacity_mwh=300,
        duration_hours=3,
        round_trip_efficiency=0.9,
        max_cycles_per_day=1,
        soc_min=0.1,
        soc_max=0.9,
        initial_soc=0.5,
        target_terminal_soc=0.1,
        min_action_duration_minutes=60,
        max_action_duration_minutes=240,
        min_rest_between_actions_minutes=60,
        temperature_warning_c=30,
        temperature_avoid_c=40,
        degradation_cost_eur_per_mwh=5,
    ),
    "aggressive": BatteryOperatingProfile(
        name="aggressive",
        power_mw=120,
        capacity_mwh=300,
        duration_hours=2.5,
        round_trip_efficiency=0.91,
        max_cycles_per_day=2,
        soc_min=0.08,
        soc_max=0.92,
        initial_soc=0.5,
        target_terminal_soc=0.08,
        min_action_duration_minutes=30,
        max_action_duration_minutes=240,
        min_rest_between_actions_minutes=30,
        temperature_warning_c=32,
        temperature_avoid_c=42,
        degradation_cost_eur_per_mwh=4,
    ),
    "greece_100mw_300mwh": BatteryOperatingProfile(
        name="greece_100mw_300mwh",
        power_mw=100,
        capacity_mwh=300,
        duration_hours=3,
        round_trip_efficiency=0.85,
        max_cycles_per_day=1.5,
        soc_min=0.1,
        soc_max=0.9,
        initial_soc=0.5,
        target_terminal_soc=0.1,
        min_action_duration_minutes=15,
        max_action_duration_minutes=240,
        min_rest_between_actions_minutes=15,
        temperature_warning_c=30,
        temperature_avoid_c=40,
        degradation_cost_eur_per_mwh=5,
        auxiliary_load_percent=0.02,
        ramp_rate_mw_per_interval=100,
        grid_connection_limit_mw=100,
    ),
}


def get_battery_profile(profile_name: str) -> BatteryOperatingProfile:
    """Return a predefined battery operating profile by name."""

    normalized_name = profile_name.lower()
    if normalized_name not in BATTERY_PROFILES:
        available_profiles = ", ".join(list_battery_profiles())
        raise ValueError(
            f"Unknown battery profile '{profile_name}'. "
            f"Available profiles: {available_profiles}."
        )

    return BATTERY_PROFILES[normalized_name]


def list_battery_profiles() -> list[str]:
    """Return the available predefined battery profile names."""

    return list(BATTERY_PROFILES.keys())


def get_default_battery_profile() -> BatteryOperatingProfile:
    """Return the default battery operating profile."""

    return BATTERY_PROFILES["balanced"]
