from pydantic import BaseModel, Field

from app.battery.profiles import BatteryOperatingProfile
from app.scheduling.economics import EconomicSchedule
from app.scheduling.pairing import calculate_rest_minutes, time_to_minutes


GENERIC_ECONOMIC_REJECTION_REASON = "Schedule is not economically feasible."
POWER_DURATION_TOLERANCE = 0.2


class PhysicalConstraintResult(BaseModel):
    """Physical constraint checks for an economically evaluated schedule."""

    economic_schedule: EconomicSchedule = Field(
        ...,
        description="Economically evaluated candidate schedule.",
    )
    duration_ok: bool = Field(..., description="Whether action durations are valid.")
    cycle_limit_ok: bool = Field(..., description="Whether cycle limits allow one cycle.")
    rest_ok: bool = Field(..., description="Whether rest time between actions is valid.")
    temperature_ok: bool = Field(
        ...,
        description="Whether temperatures remain below avoid thresholds.",
    )
    temperature_warning: bool = Field(
        ...,
        description="Whether temperatures exceed warning thresholds without rejection.",
    )
    power_duration_plausible: bool = Field(
        ...,
        description="Whether power multiplied by duration is compatible with capacity.",
    )
    all_constraints_ok: bool = Field(
        ...,
        description="Whether all hard economic and physical constraints pass.",
    )
    rejection_reasons: list[str] = Field(
        default_factory=list,
        description="Hard constraint rejection reasons.",
    )
    warning_reasons: list[str] = Field(
        default_factory=list,
        description="Soft warning reasons.",
    )


def window_duration_minutes_from_times(start: str, end: str) -> int:
    """Return the duration in minutes between two HH:MM times."""

    duration_minutes = time_to_minutes(end) - time_to_minutes(start)
    if duration_minutes <= 0:
        raise ValueError("window end time must be after start time.")

    return duration_minutes


def window_temperature_status(
    temperature_avg: float | None,
    warning_threshold_c: float,
    avoid_threshold_c: float,
) -> tuple[bool, bool, str | None]:
    """Classify a window temperature against warning and avoid thresholds."""

    if temperature_avg is None:
        return True, False, None

    if temperature_avg >= avoid_threshold_c:
        return (
            False,
            False,
            f"Temperature {temperature_avg}C reaches avoid threshold {avoid_threshold_c}C.",
        )

    if temperature_avg >= warning_threshold_c:
        return (
            True,
            True,
            f"Temperature {temperature_avg}C reaches warning threshold {warning_threshold_c}C.",
        )

    return True, False, None


def evaluate_physical_constraints(
    economic_schedule: EconomicSchedule,
    profile: BatteryOperatingProfile,
) -> PhysicalConstraintResult:
    """Evaluate physical constraints for one economically evaluated schedule."""

    candidate = economic_schedule.candidate
    charge_window = candidate.charge_window
    discharge_window = candidate.discharge_window
    rejection_reasons: list[str] = []
    warning_reasons: list[str] = []

    if not economic_schedule.economically_feasible:
        rejection_reasons.append(
            economic_schedule.rejection_reason or GENERIC_ECONOMIC_REJECTION_REASON
        )

    charge_duration = window_duration_minutes_from_times(
        charge_window.start,
        charge_window.end,
    )
    discharge_duration = window_duration_minutes_from_times(
        discharge_window.start,
        discharge_window.end,
    )
    duration_ok = (
        profile.min_action_duration_minutes
        <= charge_duration
        <= profile.max_action_duration_minutes
        and profile.min_action_duration_minutes
        <= discharge_duration
        <= profile.max_action_duration_minutes
    )
    if not duration_ok:
        rejection_reasons.append(
            "Charge and discharge durations must be within profile action duration limits."
        )

    cycle_limit_ok = profile.max_cycles_per_day >= 1
    if not cycle_limit_ok:
        rejection_reasons.append("Profile max_cycles_per_day must allow at least one cycle.")

    rest_minutes = calculate_rest_minutes(charge_window, discharge_window)
    rest_ok = rest_minutes >= profile.min_rest_between_actions_minutes
    if not rest_ok:
        rejection_reasons.append(
            "Rest time between charge and discharge is below profile minimum."
        )

    temperature_ok = True
    temperature_warning = False
    for label, window in (
        ("charge", charge_window),
        ("discharge", discharge_window),
    ):
        window_temperature_ok, window_temperature_warning, reason = (
            window_temperature_status(
                temperature_avg=window.temperature_avg,
                warning_threshold_c=profile.temperature_warning_c,
                avoid_threshold_c=profile.temperature_avoid_c,
            )
        )
        temperature_ok = temperature_ok and window_temperature_ok
        temperature_warning = temperature_warning or window_temperature_warning

        if reason is None:
            continue

        if window_temperature_ok:
            warning_reasons.append(f"{label.capitalize()} window: {reason}")
        else:
            rejection_reasons.append(f"{label.capitalize()} window: {reason}")

    implied_capacity_mwh = profile.power_mw * profile.duration_hours
    lower_bound = profile.capacity_mwh * (1 - POWER_DURATION_TOLERANCE)
    upper_bound = profile.capacity_mwh * (1 + POWER_DURATION_TOLERANCE)
    power_duration_plausible = lower_bound <= implied_capacity_mwh <= upper_bound
    if not power_duration_plausible:
        rejection_reasons.append(
            "Profile power and duration imply a capacity outside the allowed tolerance."
        )

    all_constraints_ok = (
        economic_schedule.economically_feasible
        and duration_ok
        and cycle_limit_ok
        and rest_ok
        and temperature_ok
        and power_duration_plausible
    )

    return PhysicalConstraintResult(
        economic_schedule=economic_schedule,
        duration_ok=duration_ok,
        cycle_limit_ok=cycle_limit_ok,
        rest_ok=rest_ok,
        temperature_ok=temperature_ok,
        temperature_warning=temperature_warning,
        power_duration_plausible=power_duration_plausible,
        all_constraints_ok=all_constraints_ok,
        rejection_reasons=rejection_reasons,
        warning_reasons=warning_reasons,
    )


def filter_physical_constraints(
    economic_schedules: list[EconomicSchedule],
    profile: BatteryOperatingProfile,
    keep_rejected: bool = False,
    max_results: int | None = None,
) -> list[PhysicalConstraintResult]:
    """Evaluate, filter, and rank schedules by physical constraints.

    Example:
        from app.battery.profiles import get_battery_profile
        from app.scheduling.windows import generate_rolling_windows
        from app.scheduling.pairing import pair_charge_discharge_windows
        from app.scheduling.economics import filter_economic_schedules
        from app.scheduling.constraints import filter_physical_constraints

        prices = [80.0] * 96
        temperatures = [25.0] * 96
        prices[44:52] = [35.0] * 8
        prices[80:88] = [120.0] * 8
        temperatures[80:88] = [31.0] * 8

        profile = get_battery_profile("balanced")
        windows = generate_rolling_windows(prices, temperatures=temperatures)
        pairs = pair_charge_discharge_windows(
            charge_windows=windows,
            discharge_windows=windows,
            min_rest_between_actions_minutes=profile.min_rest_between_actions_minutes,
            max_pairs=20,
        )
        economic = filter_economic_schedules(
            candidates=pairs,
            profile=profile,
            minimum_margin_eur_per_mwh=2.0,
            max_results=10,
        )
        physical = filter_physical_constraints(
            economic_schedules=economic,
            profile=profile,
            max_results=5,
        )
    """

    evaluated = [
        evaluate_physical_constraints(
            economic_schedule=economic_schedule,
            profile=profile,
        )
        for economic_schedule in economic_schedules
    ]

    if not keep_rejected:
        evaluated = [result for result in evaluated if result.all_constraints_ok]

    evaluated.sort(
        key=lambda result: (
            not result.all_constraints_ok,
            -result.economic_schedule.net_spread_after_costs,
            result.temperature_warning,
            -result.economic_schedule.spread_after_efficiency,
        )
    )

    if max_results is not None:
        return evaluated[:max_results]

    return evaluated
