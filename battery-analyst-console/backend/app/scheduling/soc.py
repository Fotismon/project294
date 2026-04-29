from math import sqrt

from pydantic import BaseModel, Field

from app.battery.profiles import BatteryOperatingProfile
from app.scheduling.constraints import PhysicalConstraintResult
from app.scheduling.pairing import time_to_minutes


DEFAULT_INTERVAL_MINUTES = 15
DEFAULT_INTERVALS_PER_DAY = 96


class SoCViolation(BaseModel):
    """State-of-charge limit violation at a specific interval."""

    interval_index: int = Field(..., description="Interval index after the update.")
    time: str = Field(..., description="Time after the interval update in HH:MM format.")
    soc: float = Field(..., description="State of charge after the interval update.")
    reason: str = Field(..., description="Reason the SoC value violates limits.")


class SoCFeasibilityResult(BaseModel):
    """Lightweight SoC feasibility result for a physically checked schedule."""

    physical_result: PhysicalConstraintResult = Field(
        ...,
        description="Physical constraint result being checked for SoC feasibility.",
    )
    feasible: bool = Field(..., description="Whether the schedule stays within SoC limits.")
    min_soc_allowed: float = Field(..., description="Minimum allowed SoC.")
    max_soc_allowed: float = Field(..., description="Maximum allowed SoC.")
    initial_soc: float = Field(..., description="Initial SoC used for tracking.")
    end_soc: float = Field(..., description="Final SoC after all intervals.")
    min_soc_reached: float = Field(..., description="Minimum SoC reached in the trajectory.")
    max_soc_reached: float = Field(..., description="Maximum SoC reached in the trajectory.")
    total_mwh_charged: float = Field(
        ...,
        description="Raw scheduled charged energy in MWh.",
    )
    total_mwh_discharged: float = Field(
        ...,
        description="Raw scheduled discharged energy in MWh.",
    )
    equivalent_full_cycles: float = Field(
        ...,
        description="Equivalent full cycles based on discharged energy and nominal capacity.",
    )
    trajectory: list[float] = Field(..., description="SoC trajectory including initial value.")
    violations: list[SoCViolation] = Field(
        default_factory=list,
        description="Collected SoC limit violations.",
    )


def derive_charge_discharge_efficiencies(
    round_trip_efficiency: float,
) -> tuple[float, float]:
    """Derive symmetric charge and discharge efficiencies from round-trip efficiency."""

    if round_trip_efficiency <= 0 or round_trip_efficiency > 1:
        raise ValueError("round_trip_efficiency must be greater than 0 and less than or equal to 1.")

    efficiency = sqrt(round_trip_efficiency)
    return efficiency, efficiency


def time_to_interval_index(
    time_str: str,
    interval_minutes: int = DEFAULT_INTERVAL_MINUTES,
) -> int:
    """Convert an HH:MM time string into a forecast interval index."""

    if interval_minutes <= 0:
        raise ValueError("interval_minutes must be positive.")

    minutes = time_to_minutes(time_str)
    if minutes % interval_minutes != 0:
        raise ValueError(f"time '{time_str}' is not aligned to {interval_minutes}-minute intervals.")

    return minutes // interval_minutes


def interval_index_to_time(
    interval_index: int,
    interval_minutes: int = DEFAULT_INTERVAL_MINUTES,
) -> str:
    """Convert a forecast interval index into zero-padded HH:MM time."""

    if interval_index < 0:
        raise ValueError("interval_index must be non-negative.")

    if interval_minutes <= 0:
        raise ValueError("interval_minutes must be positive.")

    total_minutes = interval_index * interval_minutes
    hours = total_minutes // 60
    minutes = total_minutes % 60
    return f"{hours:02d}:{minutes:02d}"


def build_power_vectors(
    charge_start_index: int,
    charge_end_index: int,
    discharge_start_index: int,
    discharge_end_index: int,
    power_mw: float,
    intervals_per_day: int = DEFAULT_INTERVALS_PER_DAY,
) -> tuple[list[float], list[float]]:
    """Build charge and discharge power vectors for a daily interval series."""

    if power_mw <= 0:
        raise ValueError("power_mw must be greater than 0.")

    if intervals_per_day <= 0:
        raise ValueError("intervals_per_day must be positive.")

    for index in (
        charge_start_index,
        charge_end_index,
        discharge_start_index,
        discharge_end_index,
    ):
        if index < 0 or index > intervals_per_day:
            raise ValueError("window indexes must be within the interval day bounds.")

    if charge_start_index >= charge_end_index:
        raise ValueError("charge_start_index must be less than charge_end_index.")

    if discharge_start_index >= discharge_end_index:
        raise ValueError("discharge_start_index must be less than discharge_end_index.")

    ranges_overlap = (
        charge_start_index < discharge_end_index
        and discharge_start_index < charge_end_index
    )
    if ranges_overlap:
        raise ValueError("charge and discharge ranges must not overlap.")

    charge_power_mw = [0.0] * intervals_per_day
    discharge_power_mw = [0.0] * intervals_per_day

    for index in range(charge_start_index, charge_end_index):
        charge_power_mw[index] = power_mw

    for index in range(discharge_start_index, discharge_end_index):
        discharge_power_mw[index] = power_mw

    return charge_power_mw, discharge_power_mw


def calculate_energy_throughput(
    charge_power_mw: list[float],
    discharge_power_mw: list[float],
    interval_minutes: int = DEFAULT_INTERVAL_MINUTES,
) -> tuple[float, float]:
    """Calculate raw AC-side charged and discharged energy throughput in MWh."""

    if len(charge_power_mw) != len(discharge_power_mw):
        raise ValueError("charge and discharge power vectors must have the same length.")

    if interval_minutes <= 0:
        raise ValueError("interval_minutes must be positive.")

    delta_hours = interval_minutes / 60
    total_mwh_charged = sum(charge_power_mw) * delta_hours
    total_mwh_discharged = sum(discharge_power_mw) * delta_hours
    return round(total_mwh_charged, 4), round(total_mwh_discharged, 4)


def calculate_equivalent_full_cycles(
    total_mwh_discharged: float,
    capacity_mwh: float,
) -> float:
    """Calculate equivalent full cycles from discharged energy and capacity.

    Example:
        # Balanced profile: 100 MW, 300 MWh, one 1-hour discharge window.
        calculate_equivalent_full_cycles(100.0, 300.0)  # 0.3333
    """

    if capacity_mwh <= 0:
        raise ValueError("capacity_mwh must be greater than 0.")

    if total_mwh_discharged < 0:
        raise ValueError("total_mwh_discharged must be greater than or equal to 0.")

    return round(total_mwh_discharged / capacity_mwh, 4)


def track_soc_feasibility(
    physical_result: PhysicalConstraintResult,
    profile: BatteryOperatingProfile,
    interval_minutes: int = DEFAULT_INTERVAL_MINUTES,
    intervals_per_day: int = DEFAULT_INTERVALS_PER_DAY,
) -> SoCFeasibilityResult:
    """Track lightweight SoC feasibility across a 96-interval candidate schedule."""

    candidate = physical_result.economic_schedule.candidate
    charge_window = candidate.charge_window
    discharge_window = candidate.discharge_window

    charge_start_index = time_to_interval_index(charge_window.start, interval_minutes)
    charge_end_index = time_to_interval_index(charge_window.end, interval_minutes)
    discharge_start_index = time_to_interval_index(discharge_window.start, interval_minutes)
    discharge_end_index = time_to_interval_index(discharge_window.end, interval_minutes)

    charge_power_mw, discharge_power_mw = build_power_vectors(
        charge_start_index=charge_start_index,
        charge_end_index=charge_end_index,
        discharge_start_index=discharge_start_index,
        discharge_end_index=discharge_end_index,
        power_mw=profile.power_mw,
        intervals_per_day=intervals_per_day,
    )
    total_mwh_charged, total_mwh_discharged = calculate_energy_throughput(
        charge_power_mw=charge_power_mw,
        discharge_power_mw=discharge_power_mw,
        interval_minutes=interval_minutes,
    )
    equivalent_full_cycles = calculate_equivalent_full_cycles(
        total_mwh_discharged=total_mwh_discharged,
        capacity_mwh=profile.capacity_mwh,
    )
    charge_efficiency, discharge_efficiency = derive_charge_discharge_efficiencies(
        profile.round_trip_efficiency
    )

    delta_hours = interval_minutes / 60
    soc = profile.initial_soc
    trajectory = [round(soc, 4)]
    violations: list[SoCViolation] = []

    for index in range(intervals_per_day):
        soc = soc + (
            (charge_power_mw[index] * charge_efficiency)
            - (discharge_power_mw[index] / discharge_efficiency)
        ) * delta_hours / profile.capacity_mwh
        rounded_soc = round(soc, 4)
        trajectory.append(rounded_soc)

        violation_time = interval_index_to_time(index + 1, interval_minutes)
        if soc < profile.soc_min:
            violations.append(
                SoCViolation(
                    interval_index=index + 1,
                    time=violation_time,
                    soc=rounded_soc,
                    reason="SoC is below the minimum allowed limit.",
                )
            )
        elif soc > profile.soc_max:
            violations.append(
                SoCViolation(
                    interval_index=index + 1,
                    time=violation_time,
                    soc=rounded_soc,
                    reason="SoC is above the maximum allowed limit.",
                )
            )

    feasible = physical_result.all_constraints_ok and not violations

    return SoCFeasibilityResult(
        physical_result=physical_result,
        feasible=feasible,
        min_soc_allowed=profile.soc_min,
        max_soc_allowed=profile.soc_max,
        initial_soc=profile.initial_soc,
        end_soc=trajectory[-1],
        min_soc_reached=min(trajectory),
        max_soc_reached=max(trajectory),
        total_mwh_charged=total_mwh_charged,
        total_mwh_discharged=total_mwh_discharged,
        equivalent_full_cycles=equivalent_full_cycles,
        trajectory=trajectory,
        violations=violations,
    )


def filter_soc_feasible_schedules(
    physical_results: list[PhysicalConstraintResult],
    profile: BatteryOperatingProfile,
    keep_infeasible: bool = False,
    max_results: int | None = None,
) -> list[SoCFeasibilityResult]:
    """Track, filter, and rank schedules by lightweight SoC feasibility.

    Example:
        from app.battery.profiles import get_battery_profile
        from app.scheduling.windows import generate_rolling_windows
        from app.scheduling.pairing import pair_charge_discharge_windows
        from app.scheduling.economics import filter_economic_schedules
        from app.scheduling.constraints import filter_physical_constraints
        from app.scheduling.soc import filter_soc_feasible_schedules

        prices = [80.0] * 96
        temperatures = [25.0] * 96
        prices[44:52] = [35.0] * 8
        prices[80:88] = [120.0] * 8

        profile = get_battery_profile("balanced")
        windows = generate_rolling_windows(prices, temperatures=temperatures)
        pairs = pair_charge_discharge_windows(
            charge_windows=windows,
            discharge_windows=windows,
            min_rest_between_actions_minutes=profile.min_rest_between_actions_minutes,
            max_pairs=50,
        )
        economic = filter_economic_schedules(
            candidates=pairs,
            profile=profile,
            minimum_margin_eur_per_mwh=2.0,
            max_results=20,
        )
        physical = filter_physical_constraints(
            economic_schedules=economic,
            profile=profile,
            max_results=10,
        )
        soc_results = filter_soc_feasible_schedules(
            physical_results=physical,
            profile=profile,
            max_results=5,
        )
    """

    tracked = [
        track_soc_feasibility(physical_result=physical_result, profile=profile)
        for physical_result in physical_results
    ]

    if not keep_infeasible:
        tracked = [result for result in tracked if result.feasible]

    tracked.sort(
        key=lambda result: (
            not result.feasible,
            -result.physical_result.economic_schedule.net_spread_after_costs,
            len(result.violations),
            abs(result.end_soc - profile.target_terminal_soc),
        )
    )

    if max_results is not None:
        return tracked[:max_results]

    return tracked
