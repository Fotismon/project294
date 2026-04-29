from app.battery.profiles import BatteryOperatingProfile, get_battery_profile
from app.schemas.scenario import ScenarioOverrideRequest
from app.schemas.schedule import (
    Alert,
    AlternativeSchedule,
    BatteryStress,
    DispatchDiagnostics,
    PhysicalConstraints,
    ScheduleResponse,
    SoCFeasibility,
    Window,
)
from app.scheduling.alerts import (
    convert_analyst_alert_to_schedule_alert,
    generate_dispatch_diagnostic_alerts,
    generate_alerts,
)
from app.scheduling.constraints import filter_physical_constraints
from app.scheduling.diagnostics import (
    build_diagnostics_explanation_lines,
    build_empty_dispatch_diagnostics,
    compute_dispatch_diagnostics,
)
from app.scheduling.dispatch import (
    build_dispatch_plan_from_windows,
    select_profitable_dispatch_windows,
)
from app.scheduling.economics import filter_economic_schedules
from app.scheduling.optimizer_metadata import optimizer_metadata_for_request
from app.scheduling.pairing import pair_charge_discharge_windows
from app.scheduling.profitability import build_hurdle_explanation_lines
from app.scheduling.recommendation import (
    FinalRecommendation,
    RecommendedSchedule,
    build_final_recommendation,
)
from app.scheduling.soc import filter_soc_feasible_schedules
from app.scheduling.windows import generate_rolling_windows


ALLOWED_TEMPERATURE_POLICIES = {"relaxed", "normal", "strict"}
ALLOWED_RISK_APPETITES = {"conservative", "balanced", "aggressive"}


def apply_scenario_overrides(
    base_profile: BatteryOperatingProfile,
    request: ScenarioOverrideRequest,
) -> BatteryOperatingProfile:
    """Apply scenario overrides to a copy of the selected battery profile."""

    if request.temperature_policy not in ALLOWED_TEMPERATURE_POLICIES:
        raise ValueError(
            "temperature_policy must be one of: relaxed, normal, strict."
        )

    if request.risk_appetite not in ALLOWED_RISK_APPETITES:
        raise ValueError("risk_appetite must be one of: conservative, balanced, aggressive.")

    updates: dict[str, float | int] = {}
    if request.round_trip_efficiency is not None:
        updates["round_trip_efficiency"] = request.round_trip_efficiency
    if request.duration_hours is not None:
        updates["duration_hours"] = request.duration_hours
    if request.max_cycles_per_day is not None:
        updates["max_cycles_per_day"] = request.max_cycles_per_day
    if request.degradation_cost_eur_per_mwh is not None:
        updates["degradation_cost_eur_per_mwh"] = request.degradation_cost_eur_per_mwh

    if request.temperature_policy == "relaxed":
        updates["temperature_warning_c"] = base_profile.temperature_warning_c + 2
        updates["temperature_avoid_c"] = base_profile.temperature_avoid_c + 2
    elif request.temperature_policy == "strict":
        updates["temperature_warning_c"] = base_profile.temperature_warning_c - 2
        updates["temperature_avoid_c"] = base_profile.temperature_avoid_c - 2

    return base_profile.model_copy(update=updates)


def scenario_minimum_margin(base_margin: float, risk_appetite: str) -> float:
    """Adjust minimum margin according to scenario risk appetite."""

    if base_margin < 0:
        raise ValueError("base_margin must be greater than or equal to 0.")

    if risk_appetite == "conservative":
        return round(base_margin + 3.0, 2)
    if risk_appetite == "balanced":
        return round(base_margin, 2)
    if risk_appetite == "aggressive":
        return round(max(0.0, base_margin - 1.0), 2)

    raise ValueError("risk_appetite must be one of: conservative, balanced, aggressive.")


def run_scenario_analysis(request: ScenarioOverrideRequest) -> ScheduleResponse:
    """Run the MVP scenario analysis pipeline and return a ScheduleResponse."""

    base_profile = get_battery_profile(request.profile_name)
    profile = apply_scenario_overrides(base_profile, request)

    # This endpoint uses the real internal scheduling pipeline for scenario analysis.
    # It is still an MVP and uses simplified expected value and feasibility calculations.
    windows = generate_rolling_windows(request.prices, request.temperatures)
    _, v12_discharge_windows, v12_explanation = select_profitable_dispatch_windows(
        windows=windows,
        profile=profile,
    )
    pairs = pair_charge_discharge_windows(
        charge_windows=windows,
        discharge_windows=windows,
        min_rest_between_actions_minutes=profile.min_rest_between_actions_minutes,
        max_pairs=100,
    )
    effective_margin = scenario_minimum_margin(
        request.minimum_margin_eur_per_mwh,
        request.risk_appetite,
    )
    economic = filter_economic_schedules(
        candidates=pairs,
        profile=profile,
        minimum_margin_eur_per_mwh=effective_margin,
        max_results=50,
    )
    physical = filter_physical_constraints(
        economic_schedules=economic,
        profile=profile,
        max_results=25,
    )
    soc_results = filter_soc_feasible_schedules(
        physical_results=physical,
        profile=profile,
        max_results=10,
    )
    recommendation = build_final_recommendation(
        soc_results=soc_results,
        forecast_confidence=request.forecast_confidence,
        market_volatility=request.market_volatility,
        forecast_uncertainty_width=request.forecast_uncertainty_width,
        data_quality_level=request.data_quality_level,
    )

    return recommendation_to_schedule_response(
        recommendation=recommendation,
        request=request,
        profile=profile,
        effective_margin=effective_margin,
        dispatch_explanation=v12_explanation if v12_discharge_windows else [],
    )


def recommendation_to_schedule_response(
    recommendation: FinalRecommendation,
    request: ScenarioOverrideRequest,
    profile: BatteryOperatingProfile,
    effective_margin: float,
    dispatch_explanation: list[str] | None = None,
) -> ScheduleResponse:
    """Convert an internal final recommendation into the public ScheduleResponse shape."""

    if recommendation.selected is None:
        return hold_schedule_response(
            request=request,
            profile=profile,
            recommendation=recommendation,
            dispatch_explanation=dispatch_explanation,
        )

    selected = recommendation.selected
    soc_result = selected.soc_result
    physical_result = soc_result.physical_result
    economic_schedule = physical_result.economic_schedule
    candidate = economic_schedule.candidate
    stress = selected.stress
    confidence = selected.confidence

    base_value = economic_schedule.net_spread_after_costs * soc_result.total_mwh_discharged
    dispatch_plan = build_dispatch_plan_from_windows(
        charge_windows=[candidate.charge_window],
        discharge_windows=[candidate.discharge_window],
        prices=request.prices,
        profile=profile,
    )
    diagnostics = compute_dispatch_diagnostics(
        charge_power_mw=dispatch_plan.charge_power_mw,
        discharge_power_mw=dispatch_plan.discharge_power_mw,
        soc_trajectory=dispatch_plan.soc_trajectory,
        profile=profile,
    )
    alerts = build_schedule_alerts(
        recommendation=recommendation,
        request=request,
        effective_margin=effective_margin,
        diagnostics=diagnostics,
    )

    explanation = recommendation.explanation + [
        (
            f"Scenario used profile '{request.profile_name}' with risk appetite "
            f"'{request.risk_appetite}'."
        )
    ] + build_hurdle_explanation_lines(
        charge_price=candidate.charge_window.avg_price,
        discharge_price=candidate.discharge_window.avg_price,
        round_trip_efficiency=profile.round_trip_efficiency,
        degradation_cost_eur_per_mwh=profile.degradation_cost_eur_per_mwh,
    ) + build_diagnostics_explanation_lines(diagnostics) + (
        dispatch_explanation or []
    )

    return ScheduleResponse(
        date=request.date,
        decision=recommendation.decision,
        confidence=confidence.level,
        optimizer=optimizer_metadata_for_request(request.optimizer_mode),
        charge_window=Window(
            start=candidate.charge_window.start,
            end=candidate.charge_window.end,
            avg_price=candidate.charge_window.avg_price,
        ),
        discharge_window=Window(
            start=candidate.discharge_window.start,
            end=candidate.discharge_window.end,
            avg_price=candidate.discharge_window.avg_price,
        ),
        spread_after_efficiency=economic_schedule.spread_after_efficiency,
        expected_value_range_eur=[
            round(base_value * 0.85, 2),
            round(base_value * 1.15, 2),
        ],
        soc_feasibility=SoCFeasibility(
            feasible=soc_result.feasible,
            min_soc=soc_result.min_soc_allowed,
            max_soc=soc_result.max_soc_allowed,
            start_soc=soc_result.initial_soc,
            end_soc=soc_result.end_soc,
            violations=[violation.reason for violation in soc_result.violations],
        ),
        battery_stress=BatteryStress(
            level=stress.level,
            score=stress.score,
            reasons=stress.reasons,
        ),
        physical_constraints=PhysicalConstraints(
            duration_ok=physical_result.duration_ok,
            cycle_limit_ok=physical_result.cycle_limit_ok,
            temperature_ok=physical_result.temperature_ok,
            round_trip_efficiency_applied=True,
            rapid_switching_avoided=not stress.rapid_switching_risk,
        ),
        diagnostics=diagnostics,
        alternatives=[
            recommended_to_alternative(index, alternative)
            for index, alternative in enumerate(recommendation.alternatives, start=1)
        ],
        alerts=alerts,
        explanation=explanation,
    )


def recommended_to_alternative(
    index: int,
    recommended: RecommendedSchedule,
) -> AlternativeSchedule:
    """Convert a recommended alternative into a public AlternativeSchedule."""

    soc_result = recommended.soc_result
    economic_schedule = soc_result.physical_result.economic_schedule
    candidate = economic_schedule.candidate
    base_value = economic_schedule.net_spread_after_costs * soc_result.total_mwh_discharged

    return AlternativeSchedule(
        label=f"alternative_{index}",
        charge_window=Window(
            start=candidate.charge_window.start,
            end=candidate.charge_window.end,
            avg_price=candidate.charge_window.avg_price,
        ),
        discharge_window=Window(
            start=candidate.discharge_window.start,
            end=candidate.discharge_window.end,
            avg_price=candidate.discharge_window.avg_price,
        ),
        expected_value_range_eur=[
            round(base_value * 0.85, 2),
            round(base_value * 1.15, 2),
        ],
        reason=(
            f"{recommended.confidence.level} confidence, "
            f"{recommended.stress.level} stress, score {recommended.score.final_score}."
        ),
    )


def hold_schedule_response(
    request: ScenarioOverrideRequest,
    profile: BatteryOperatingProfile,
    recommendation: FinalRecommendation,
    dispatch_explanation: list[str] | None = None,
) -> ScheduleResponse:
    """Build a hold ScheduleResponse when no selected schedule exists."""

    hold_reasons = recommendation.hold_reasons or ["No feasible schedule found."]
    placeholder_window = Window(start="00:00", end="00:00", avg_price=0.0)
    diagnostics = build_empty_dispatch_diagnostics(profile)
    alerts = build_schedule_alerts(
        recommendation=recommendation,
        request=request,
        effective_margin=None,
        diagnostics=diagnostics,
    )

    return ScheduleResponse(
        date=request.date,
        decision="hold",
        confidence="low",
        optimizer=optimizer_metadata_for_request(request.optimizer_mode),
        charge_window=placeholder_window,
        discharge_window=placeholder_window,
        spread_after_efficiency=0.0,
        expected_value_range_eur=[0.0, 0.0],
        soc_feasibility=SoCFeasibility(
            feasible=False,
            min_soc=profile.soc_min,
            max_soc=profile.soc_max,
            start_soc=profile.initial_soc,
            end_soc=profile.initial_soc,
            violations=hold_reasons,
        ),
        battery_stress=BatteryStress(
            level="high",
            score=100,
            reasons=["No feasible executable schedule was found."],
        ),
        physical_constraints=PhysicalConstraints(
            duration_ok=False,
            cycle_limit_ok=False,
            temperature_ok=False,
            round_trip_efficiency_applied=True,
            rapid_switching_avoided=True,
        ),
        diagnostics=diagnostics,
        alternatives=[],
        alerts=alerts,
        explanation=recommendation.explanation
        + [
            (
                "Hurdle-cost check did not identify an executable spread after "
                "efficiency and degradation cost."
            )
        ]
        + build_diagnostics_explanation_lines(diagnostics)
        + (
            dispatch_explanation
            or ["No profitable multi-dispatch plan cleared the hurdle-cost check."]
        ),
    )


def build_schedule_alerts(
    recommendation: FinalRecommendation,
    request: ScenarioOverrideRequest,
    effective_margin: float | None,
    diagnostics: DispatchDiagnostics | None = None,
) -> list[Alert]:
    """Build generated analyst alerts followed by scenario metadata alerts."""

    analyst_alerts = generate_alerts(
        recommendation=recommendation,
        forecast_uncertainty_width=request.forecast_uncertainty_width,
        data_quality_level=request.data_quality_level,
    )
    analyst_alerts = analyst_alerts + (
        generate_dispatch_diagnostic_alerts(diagnostics)
        if diagnostics is not None
        else []
    )
    schedule_alerts = [
        convert_analyst_alert_to_schedule_alert(alert)
        for alert in analyst_alerts
    ]
    scenario_metadata_alerts = [
        Alert(level="info", message=note, metric="scenario")
        for note in scenario_notes(request, effective_margin)
    ]

    return deduplicate_schedule_alerts(schedule_alerts + scenario_metadata_alerts)


def deduplicate_schedule_alerts(alerts: list[Alert]) -> list[Alert]:
    """Remove duplicate ScheduleResponse alerts while preserving order."""

    seen: set[tuple[str, str | None, str]] = set()
    deduplicated: list[Alert] = []
    for alert in alerts:
        key = (alert.level, alert.metric, alert.message)
        if key in seen:
            continue
        seen.add(key)
        deduplicated.append(alert)

    return deduplicated


def scenario_notes(
    request: ScenarioOverrideRequest,
    effective_margin: float | None,
) -> list[str]:
    """Return short notes describing scenario settings and applied overrides."""

    notes = [
        f"Temperature policy: {request.temperature_policy}.",
        f"Risk appetite: {request.risk_appetite}.",
    ]
    if effective_margin is not None:
        notes.append(f"Effective minimum margin: {effective_margin} EUR/MWh.")
    if request.round_trip_efficiency is not None:
        notes.append(
            f"round_trip_efficiency override applied: {request.round_trip_efficiency}."
        )
    if request.duration_hours is not None:
        notes.append(f"duration_hours override applied: {request.duration_hours}.")
    if request.max_cycles_per_day is not None:
        notes.append(
            f"max_cycles_per_day override applied: {request.max_cycles_per_day}."
        )
    if request.degradation_cost_eur_per_mwh is not None:
        notes.append(
            "degradation_cost_eur_per_mwh override applied: "
            f"{request.degradation_cost_eur_per_mwh}."
        )

    return notes
