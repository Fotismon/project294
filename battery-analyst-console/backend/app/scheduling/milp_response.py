from app.battery.profiles import BatteryOperatingProfile
from app.schemas.schedule import (
    Alert,
    BatteryStress,
    DispatchDiagnostics,
    OptimizerMetadata,
    PhysicalConstraints,
    ScheduleResponse,
    SoCFeasibility,
    Window,
)
from app.scheduling.diagnostics import build_empty_dispatch_diagnostics
from app.scheduling.dispatch import (
    DispatchBlock,
    extract_dispatch_blocks,
    select_primary_charge_window,
    select_primary_discharge_window,
)
from app.scheduling.milp import MilpDispatchResult
from app.scheduling.value_diagnostics import (
    build_fleet_economics,
    build_forecast_provenance,
    build_price_spread_diagnostics,
)


def dispatch_block_to_schedule_window(block: DispatchBlock | None) -> Window:
    if block is None:
        return Window(start="00:00", end="00:00", avg_price=0.0)

    return Window(start=block.start, end=block.end, avg_price=block.avg_price)


def extract_primary_windows_from_milp(
    result: MilpDispatchResult,
    prices: list[float],
) -> tuple[Window, Window, list[DispatchBlock], list[DispatchBlock]]:
    charge_blocks = extract_dispatch_blocks(
        result.charge_power_mw,
        prices,
        kind="charge",
    )
    discharge_blocks = extract_dispatch_blocks(
        result.discharge_power_mw,
        prices,
        kind="discharge",
    )
    charge_window = dispatch_block_to_schedule_window(
        select_primary_charge_window(charge_blocks)
    )
    discharge_window = dispatch_block_to_schedule_window(
        select_primary_discharge_window(discharge_blocks)
    )
    return charge_window, discharge_window, charge_blocks, discharge_blocks


def estimate_milp_expected_value_range(result: MilpDispatchResult) -> list[float]:
    if not result.feasible or result.objective_value is None:
        return [0.0, 0.0]

    if result.objective_value < 0:
        value = round(result.objective_value, 2)
        return [value, value]

    return [
        round(result.objective_value * 0.9, 2),
        round(result.objective_value * 1.1, 2),
    ]


def calculate_milp_spread_after_efficiency(
    charge_window: Window,
    discharge_window: Window,
    profile: BatteryOperatingProfile,
) -> float:
    if charge_window.start == charge_window.end or discharge_window.start == discharge_window.end:
        return 0.0

    adjusted_charge_price = charge_window.avg_price / profile.round_trip_efficiency
    return round(discharge_window.avg_price - adjusted_charge_price, 2)


def build_milp_soc_feasibility(
    result: MilpDispatchResult,
    profile: BatteryOperatingProfile,
) -> SoCFeasibility:
    diagnostics = result.diagnostics
    violations: list[str] = []
    if not result.feasible:
        violations.append(result.error_message or "MILP dispatch was not feasible.")
    if diagnostics is not None and diagnostics.soc_min_violation_count > 0:
        violations.append("SoC fell below minimum bound.")
    if diagnostics is not None and diagnostics.soc_max_violation_count > 0:
        violations.append("SoC exceeded maximum bound.")

    no_soc_violations = (
        diagnostics is None
        or (
            diagnostics.soc_min_violation_count == 0
            and diagnostics.soc_max_violation_count == 0
        )
    )

    return SoCFeasibility(
        feasible=result.feasible and no_soc_violations,
        min_soc=profile.soc_min,
        max_soc=profile.soc_max,
        start_soc=profile.initial_soc,
        end_soc=(
            result.soc_trajectory[-1]
            if result.feasible and result.soc_trajectory
            else profile.initial_soc
        ),
        violations=violations,
    )


def build_milp_physical_constraints(
    result: MilpDispatchResult,
    profile: BatteryOperatingProfile,
) -> PhysicalConstraints:
    diagnostics = result.diagnostics
    if not result.feasible:
        return PhysicalConstraints(
            duration_ok=False,
            cycle_limit_ok=False,
            temperature_ok=True,
            round_trip_efficiency_applied=True,
            rapid_switching_avoided=False,
        )

    cycle_limit_ok = True
    rapid_switching_avoided = True
    if diagnostics is not None:
        cycle_limit_ok = diagnostics.equivalent_full_cycles <= profile.max_cycles_per_day
        rapid_switching_avoided = diagnostics.ramp_rate_violations == 0

    return PhysicalConstraints(
        duration_ok=True,
        cycle_limit_ok=cycle_limit_ok,
        temperature_ok=True,
        round_trip_efficiency_applied=True,
        rapid_switching_avoided=rapid_switching_avoided,
    )


def build_milp_battery_stress(
    result: MilpDispatchResult,
    profile: BatteryOperatingProfile,
) -> BatteryStress:
    if not result.feasible:
        return BatteryStress(
            level="high",
            score=100,
            reasons=["MILP dispatch was not feasible."],
        )

    diagnostics = result.diagnostics
    efc = diagnostics.equivalent_full_cycles if diagnostics is not None else 0.0
    if efc < 0.5:
        level = "low"
        score = 25
    elif efc < 1.0:
        level = "medium"
        score = 50
    else:
        level = "high"
        score = 75

    reasons = [
        f"MILP dispatch equivalent full cycles: {efc:.4f}.",
        (
            "Cycle limit respected."
            if efc <= profile.max_cycles_per_day
            else "Cycle limit exceeded."
        ),
        "Round-trip efficiency and degradation cost included in objective.",
    ]
    if diagnostics is not None and diagnostics.auxiliary_load_mw > 0:
        reasons.append("Auxiliary load included in objective.")

    return BatteryStress(level=level, score=score, reasons=reasons)


def build_milp_alerts(
    result: MilpDispatchResult,
    diagnostics: DispatchDiagnostics | None,
) -> list[Alert]:
    alerts: list[Alert] = []
    if not result.feasible:
        alerts.append(
            Alert(
                level="critical",
                message="MILP dispatch was not feasible.",
                metric="milp",
            )
        )

    if diagnostics is None:
        return alerts

    if diagnostics.simultaneous_action_violations > 0:
        alerts.append(
            Alert(
                level="critical",
                message="Physical dispatch violation: simultaneous charge/discharge.",
                metric="dispatch_diagnostics",
            )
        )
    if not diagnostics.grid_connection_limit_ok:
        alerts.append(
            Alert(
                level="warning",
                message="Grid connection limit exceeded by MILP dispatch.",
                metric="dispatch_diagnostics",
            )
        )
    if diagnostics.ramp_rate_violations > 0:
        alerts.append(
            Alert(
                level="warning",
                message="Ramp-rate violations detected in MILP dispatch.",
                metric="dispatch_diagnostics",
            )
        )
    if diagnostics.soc_min_violation_count + diagnostics.soc_max_violation_count > 0:
        alerts.append(
            Alert(
                level="critical",
                message="SoC limit violation detected in MILP dispatch.",
                metric="dispatch_diagnostics",
            )
        )

    return alerts


def build_milp_explanation_lines(
    result: MilpDispatchResult,
    charge_blocks: list[DispatchBlock],
    discharge_blocks: list[DispatchBlock],
    diagnostics: DispatchDiagnostics | None,
) -> list[str]:
    if not result.feasible:
        lines = [
            f"MILP solver status: {result.solver_status}.",
            "No executable MILP dispatch was returned.",
        ]
        if result.error_message:
            lines.append(result.error_message)
        return lines

    lines = [
        "MILP optimizer solved the 96-interval dispatch problem.",
        f"Solver status: {result.solver_status.lower()}.",
    ]
    if result.objective_value is not None:
        lines.append(f"Objective value: {result.objective_value:.2f} EUR.")
    lines.append(
        f"Selected {len(charge_blocks)} charge block(s) and "
        f"{len(discharge_blocks)} discharge block(s)."
    )

    if diagnostics is not None:
        lines.extend(
            [
                f"Total charged energy: {diagnostics.total_mwh_charged:.2f} MWh.",
                f"Total discharged energy: {diagnostics.total_mwh_discharged:.2f} MWh.",
                f"Equivalent full cycles: {diagnostics.equivalent_full_cycles:.4f}.",
                f"Auxiliary load applied: {diagnostics.auxiliary_load_mw:.2f} MW.",
            ]
        )
        if diagnostics.simultaneous_action_violations == 0:
            lines.append("No simultaneous charge/discharge violations detected.")
        else:
            lines.append(
                "Simultaneous charge/discharge violations detected: "
                f"{diagnostics.simultaneous_action_violations}."
            )
        if diagnostics.grid_connection_limit_ok:
            lines.append("Grid connection limit respected.")
        else:
            lines.append(
                "Grid connection limit exceeded: max "
                f"{diagnostics.max_grid_power_mw:.2f} MW vs limit "
                f"{diagnostics.grid_connection_limit_mw:.2f} MW."
            )
        lines.append(f"Terminal SoC error: {diagnostics.terminal_soc_error:.4f}.")

    return lines


def build_milp_optimizer_metadata(
    requested_mode: str,
    result: MilpDispatchResult,
) -> OptimizerMetadata:
    is_optimal = result.feasible and result.solver_status == "Optimal"
    return OptimizerMetadata(
        requested_mode=requested_mode,
        used_mode="milp",
        fallback_used=False,
        fallback_reason=None if is_optimal else result.error_message,
        model_version="milp_v1",
        is_optimal=is_optimal,
        solver_status=result.solver_status.lower(),
    )


def convert_milp_result_to_schedule_response(
    result: MilpDispatchResult,
    prices: list[float],
    profile: BatteryOperatingProfile,
    date: str,
    requested_mode: str = "milp",
    reference_prices: list[float] | None = None,
) -> ScheduleResponse:
    diagnostics = result.diagnostics or build_empty_dispatch_diagnostics(profile)
    if not result.feasible:
        charge_window = dispatch_block_to_schedule_window(None)
        discharge_window = dispatch_block_to_schedule_window(None)
        charge_blocks: list[DispatchBlock] = []
        discharge_blocks: list[DispatchBlock] = []
    else:
        (
            charge_window,
            discharge_window,
            charge_blocks,
            discharge_blocks,
        ) = extract_primary_windows_from_milp(result, prices)

    battery_stress = build_milp_battery_stress(result, profile)
    decision, confidence = classify_milp_response(result, diagnostics, battery_stress)
    single_profile_expected_value_range = estimate_milp_expected_value_range(result)
    fleet_economics = build_fleet_economics(
        single_profile_expected_value_range_eur=single_profile_expected_value_range,
        profile=profile,
    )

    return ScheduleResponse(
        date=date,
        decision=decision,
        confidence=confidence,
        optimizer=build_milp_optimizer_metadata(requested_mode, result),
        charge_window=charge_window,
        discharge_window=discharge_window,
        spread_after_efficiency=calculate_milp_spread_after_efficiency(
            charge_window,
            discharge_window,
            profile,
        ),
        expected_value_range_eur=single_profile_expected_value_range,
        single_profile_expected_value_range_eur=single_profile_expected_value_range,
        fleet_economics=fleet_economics,
        forecast_provenance=build_forecast_provenance(),
        price_spread_diagnostics=build_price_spread_diagnostics(
            prices=prices,
            charge_window=charge_window,
            discharge_window=discharge_window,
            profile=profile,
            reference_prices=reference_prices,
        ),
        soc_feasibility=build_milp_soc_feasibility(result, profile),
        battery_stress=battery_stress,
        physical_constraints=build_milp_physical_constraints(result, profile),
        diagnostics=diagnostics,
        alternatives=[],
        alerts=build_milp_alerts(result, diagnostics),
        explanation=build_milp_explanation_lines(
            result,
            charge_blocks,
            discharge_blocks,
            diagnostics,
        ),
    )


def classify_milp_response(
    result: MilpDispatchResult,
    diagnostics: DispatchDiagnostics,
    battery_stress: BatteryStress,
) -> tuple[str, str]:
    if not result.feasible or result.objective_value is None or result.objective_value <= 0:
        return "hold", "low"

    has_diagnostic_issues = (
        diagnostics.simultaneous_action_violations > 0
        or not diagnostics.grid_connection_limit_ok
        or diagnostics.ramp_rate_violations > 0
        or diagnostics.soc_min_violation_count > 0
        or diagnostics.soc_max_violation_count > 0
    )
    if has_diagnostic_issues or battery_stress.level == "high":
        return "execute_with_caution", "medium"

    return "execute", "high"
