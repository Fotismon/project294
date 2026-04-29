from app.battery.profiles import BatteryOperatingProfile, get_battery_profile
from app.schemas.schedule import (
    Alert,
    AlternativeSchedule,
    BatteryStress,
    PhysicalConstraints,
    ScheduleRequest,
    ScheduleResponse,
    SoCFeasibility,
    Window,
)
from app.scheduling.alerts import (
    convert_analyst_alert_to_schedule_alert,
    generate_alerts,
)
from app.scheduling.constraints import filter_physical_constraints
from app.scheduling.economics import filter_economic_schedules
from app.scheduling.pairing import pair_charge_discharge_windows
from app.scheduling.recommendation import (
    FinalRecommendation,
    RecommendedSchedule,
    build_final_recommendation,
)
from app.scheduling.soc import filter_soc_feasible_schedules
from app.scheduling.windows import generate_rolling_windows


def run_schedule_analysis(request: ScheduleRequest) -> ScheduleResponse:
    """Run the normal scheduling pipeline and return a ScheduleResponse."""

    if request.prices is None:
        raise ValueError("prices are required for real schedule generation.")

    profile = get_battery_profile(request.profile_name)

    # This runner connects the real internal scheduling pipeline to POST /schedule.
    # It still relies on caller-provided forecast prices until the forecast engine is integrated.
    windows = generate_rolling_windows(request.prices, request.temperatures)
    pairs = pair_charge_discharge_windows(
        charge_windows=windows,
        discharge_windows=windows,
        min_rest_between_actions_minutes=profile.min_rest_between_actions_minutes,
        max_pairs=100,
    )
    economic = filter_economic_schedules(
        candidates=pairs,
        profile=profile,
        minimum_margin_eur_per_mwh=request.minimum_margin_eur_per_mwh,
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
    )


def recommendation_to_schedule_response(
    recommendation: FinalRecommendation,
    request: ScheduleRequest,
    profile: BatteryOperatingProfile,
) -> ScheduleResponse:
    """Convert an internal final recommendation into the public ScheduleResponse shape."""

    if recommendation.selected is None:
        return hold_schedule_response(
            recommendation=recommendation,
            request=request,
            profile=profile,
        )

    selected = recommendation.selected
    soc_result = selected.soc_result
    physical_result = soc_result.physical_result
    economic_schedule = physical_result.economic_schedule
    candidate = economic_schedule.candidate
    stress = selected.stress
    confidence = selected.confidence
    base_value = economic_schedule.net_spread_after_costs * soc_result.total_mwh_discharged

    explanation = recommendation.explanation + [
        f"Schedule generated using profile '{request.profile_name}'."
    ]

    return ScheduleResponse(
        date=request.date,
        decision=recommendation.decision,
        confidence=confidence.level,
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
        alternatives=[
            recommended_to_alternative(index, alternative)
            for index, alternative in enumerate(recommendation.alternatives[:3], start=1)
        ],
        alerts=build_schedule_alerts(recommendation, request),
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
    recommendation: FinalRecommendation,
    request: ScheduleRequest,
    profile: BatteryOperatingProfile,
) -> ScheduleResponse:
    """Build a hold ScheduleResponse when no selected schedule exists."""

    hold_reasons = recommendation.hold_reasons or ["No feasible schedule found."]
    placeholder_window = Window(start="00:00", end="00:00", avg_price=0.0)

    return ScheduleResponse(
        date=request.date,
        decision="hold",
        confidence="low",
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
        alternatives=[],
        alerts=build_schedule_alerts(recommendation, request),
        explanation=recommendation.explanation,
    )


def build_schedule_alerts(
    recommendation: FinalRecommendation,
    request: ScheduleRequest,
) -> list[Alert]:
    """Build generated analyst alerts and schedule metadata alerts."""

    analyst_alerts = generate_alerts(
        recommendation=recommendation,
        forecast_uncertainty_width=request.forecast_uncertainty_width,
        data_quality_level=request.data_quality_level,
    )
    schedule_alerts = [
        convert_analyst_alert_to_schedule_alert(alert)
        for alert in analyst_alerts
    ]
    metadata_alerts = [
        Alert(
            level="info",
            message=f"Schedule generated using profile '{request.profile_name}'.",
            metric="schedule",
        )
    ]

    return deduplicate_schedule_alerts(schedule_alerts + metadata_alerts)


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
