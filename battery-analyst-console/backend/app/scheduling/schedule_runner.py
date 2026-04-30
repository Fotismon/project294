from app.battery.profiles import BatteryOperatingProfile, get_battery_profile
from app.forecasting.forecast_data import (
    build_inference_features,
    fetch_weather_forecast,
    load_feature_store,
)
from app.forecasting.forecast_engine import run_forecast
from app.schemas.schedule import (
    Alert,
    AlternativeSchedule,
    BatteryStress,
    DispatchDiagnostics,
    PhysicalConstraints,
    ScheduleRequest,
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
from app.scheduling.milp import (
    DEFAULT_INTERVALS_PER_DAY,
    MilpDispatchResult,
    solve_milp_dispatch,
)
from app.scheduling.milp_response import convert_milp_result_to_schedule_response
from app.scheduling.optimizer_metadata import (
    optimizer_metadata_for_request,
)
from app.scheduling.pairing import pair_charge_discharge_windows
from app.scheduling.profitability import build_hurdle_explanation_lines
from app.scheduling.recommendation import (
    FinalRecommendation,
    RecommendedSchedule,
    build_final_recommendation,
)
from app.scheduling.soc import filter_soc_feasible_schedules
from app.scheduling.value_diagnostics import (
    build_fleet_economics,
    build_forecast_provenance,
    build_price_spread_diagnostics,
)
from app.scheduling.windows import generate_rolling_windows


VALID_OPTIMIZER_MODES = {"milp"}


def _resolve_prices(
    request: ScheduleRequest,
) -> tuple[list[float], list[float], list[float], float, bool]:
    """Return (p50, p05, p95, uncertainty_width, auto_fetched).

    When request.prices is None, auto-fetches LightGBM forecast for request.date.
    When request.prices is provided, returns it as the price signal with no bands.
    """
    if request.prices is not None:
        width = request.forecast_uncertainty_width or 0.0
        return request.prices, request.prices, request.prices, width, False

    try:
        store = load_feature_store()
        weather = fetch_weather_forecast(request.date)
        X = build_inference_features(request.date, store, weather)
        fc = run_forecast(request.date, X)
    except FileNotFoundError:
        raise
    except Exception as exc:
        raise ValueError(
            f"Failed to auto-fetch price forecast for {request.date}: {exc}"
        ) from exc

    p50 = [pt.predicted_price for pt in fc.points]
    p05 = [pt.lower_bound for pt in fc.points]
    p95 = [pt.upper_bound for pt in fc.points]
    return p50, p05, p95, fc.avg_band_width_eur, True


def _blend_risk_prices(
    p50: list[float],
    p05: list[float],
    p95: list[float],
    uncertainty_width: float,
    blend_alpha: float = 0.25,
) -> list[float]:
    """Return a risk-blended price vector for the optimizer.

    Nudges charge-interval prices toward P05 (pessimistic) and discharge-interval
    prices toward P95 (optimistic) when forecast uncertainty is high.
    Blending weight scales from 0 at width ≤ 20 to blend_alpha at width ≥ 60.
    """
    if p05 is p50:
        return p50

    n = len(p50)
    if n == 0:
        return p50

    sorted_p50 = sorted(p50)
    q25 = sorted_p50[n // 4]
    q75 = sorted_p50[3 * n // 4]
    effective_alpha = blend_alpha * max(0.0, min(1.0, (uncertainty_width - 20.0) / 40.0))

    blended = []
    for i in range(n):
        if p50[i] <= q25:
            val = (1 - effective_alpha) * p50[i] + effective_alpha * p05[i]
        elif p50[i] >= q75:
            val = (1 - effective_alpha) * p50[i] + effective_alpha * p95[i]
        else:
            val = p50[i]
        blended.append(round(val, 2))
    return blended


def run_schedule_analysis(request: ScheduleRequest) -> ScheduleResponse:
    validate_optimizer_mode(request.optimizer_mode)

    p50, p05, p95, uncertainty_width, auto_fetched = _resolve_prices(request)

    augmented = request.model_copy(update={
        "prices": p50,
        "forecast_uncertainty_width": uncertainty_width,
        "optimizer_mode": "milp",
    })

    # p50 (unblended) used as the reference baseline in price spread diagnostics
    reference_prices = p50 if auto_fetched else None
    profile = get_battery_profile(augmented.profile_name)

    try:
        return run_milp_schedule_analysis(
            augmented,
            profile,
            requested_mode="milp",
            reference_prices=reference_prices,
            charge_prices=p05,
            discharge_prices=p95,
        )
    except Exception as error:
        failed_result = build_failed_milp_result(
            solver_status="error",
            error_message=f"MILP failed: {error}.",
        )
        return convert_milp_result_to_schedule_response(
            result=failed_result,
            prices=augmented.prices,
            profile=profile,
            date=augmented.date,
            requested_mode="milp",
            reference_prices=reference_prices,
        )


def run_milp_schedule_analysis(
    request: ScheduleRequest,
    profile: BatteryOperatingProfile,
    requested_mode: str,
    reference_prices: list[float] | None = None,
    charge_prices: list[float] | None = None,
    discharge_prices: list[float] | None = None,
) -> ScheduleResponse:
    if request.prices is None:
        raise ValueError("prices are required for MILP schedule generation.")

    result = solve_milp_dispatch(
        prices=request.prices,
        charge_prices=charge_prices,
        discharge_prices=discharge_prices,
        profile=profile,
        temperatures=request.temperatures,
    )
    return convert_milp_result_to_schedule_response(
        result=result,
        prices=request.prices,
        profile=profile,
        date=request.date,
        requested_mode=requested_mode,
        reference_prices=reference_prices,
    )


def validate_optimizer_mode(mode: str) -> None:
    if mode not in VALID_OPTIMIZER_MODES:
        allowed_modes = ", ".join(sorted(VALID_OPTIMIZER_MODES))
        raise ValueError(
            f"Invalid optimizer_mode '{mode}'. Allowed values: {allowed_modes}."
        )


def build_failed_milp_result(
    solver_status: str,
    error_message: str,
) -> MilpDispatchResult:
    zero_dispatch = [0.0] * DEFAULT_INTERVALS_PER_DAY
    return MilpDispatchResult(
        feasible=False,
        solver_status=solver_status,
        objective_value=None,
        charge_power_mw=zero_dispatch,
        discharge_power_mw=zero_dispatch,
        net_power_mw=zero_dispatch,
        soc_trajectory=[],
        energy_trajectory_mwh=[],
        diagnostics=None,
        error_message=error_message,
        explanation=[error_message],
    )


def recommendation_to_schedule_response(
    recommendation: FinalRecommendation,
    request: ScheduleRequest,
    profile: BatteryOperatingProfile,
    dispatch_explanation: list[str] | None = None,
    reference_prices: list[float] | None = None,
) -> ScheduleResponse:
    """Convert an internal final recommendation into the public ScheduleResponse shape."""

    if recommendation.selected is None:
        return hold_schedule_response(
            recommendation=recommendation,
            request=request,
            profile=profile,
            dispatch_explanation=dispatch_explanation,
            reference_prices=reference_prices,
        )

    selected = recommendation.selected
    soc_result = selected.soc_result
    physical_result = soc_result.physical_result
    economic_schedule = physical_result.economic_schedule
    candidate = economic_schedule.candidate
    stress = selected.stress
    confidence = selected.confidence
    base_value = economic_schedule.net_spread_after_costs * soc_result.total_mwh_discharged
    single_profile_expected_value_range = [
        round(base_value * 0.85, 2),
        round(base_value * 1.15, 2),
    ]
    charge_response_window = Window(
        start=candidate.charge_window.start,
        end=candidate.charge_window.end,
        avg_price=candidate.charge_window.avg_price,
    )
    discharge_response_window = Window(
        start=candidate.discharge_window.start,
        end=candidate.discharge_window.end,
        avg_price=candidate.discharge_window.avg_price,
    )
    fleet_economics = build_fleet_economics(
        single_profile_expected_value_range_eur=single_profile_expected_value_range,
        profile=profile,
    )
    dispatch_plan = build_dispatch_plan_from_windows(
        charge_windows=[candidate.charge_window],
        discharge_windows=[candidate.discharge_window],
        prices=request.prices or [0.0] * 96,
        profile=profile,
    )
    diagnostics = compute_dispatch_diagnostics(
        charge_power_mw=dispatch_plan.charge_power_mw,
        discharge_power_mw=dispatch_plan.discharge_power_mw,
        soc_trajectory=dispatch_plan.soc_trajectory,
        profile=profile,
    )

    explanation = recommendation.explanation + [
        f"Schedule generated using profile '{request.profile_name}'."
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
        charge_window=charge_response_window,
        discharge_window=discharge_response_window,
        spread_after_efficiency=economic_schedule.spread_after_efficiency,
        expected_value_range_eur=single_profile_expected_value_range,
        single_profile_expected_value_range_eur=single_profile_expected_value_range,
        fleet_economics=fleet_economics,
        forecast_provenance=build_forecast_provenance(),
        price_spread_diagnostics=build_price_spread_diagnostics(
            prices=request.prices or [],
            charge_window=charge_response_window,
            discharge_window=discharge_response_window,
            profile=profile,
            reference_prices=reference_prices,
        ),
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
            for index, alternative in enumerate(recommendation.alternatives[:3], start=1)
        ],
        alerts=build_schedule_alerts(recommendation, request, diagnostics),
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
    dispatch_explanation: list[str] | None = None,
    reference_prices: list[float] | None = None,
) -> ScheduleResponse:
    """Build a hold ScheduleResponse when no selected schedule exists."""

    hold_reasons = recommendation.hold_reasons or ["No feasible schedule found."]
    placeholder_window = Window(start="00:00", end="00:00", avg_price=0.0)
    diagnostics = build_empty_dispatch_diagnostics(profile)
    fleet_economics = build_fleet_economics(
        single_profile_expected_value_range_eur=[0.0, 0.0],
        profile=profile,
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
        single_profile_expected_value_range_eur=[0.0, 0.0],
        fleet_economics=fleet_economics,
        forecast_provenance=build_forecast_provenance(),
        price_spread_diagnostics=build_price_spread_diagnostics(
            prices=request.prices or [],
            charge_window=placeholder_window,
            discharge_window=placeholder_window,
            profile=profile,
            reference_prices=reference_prices,
        ),
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
        alerts=build_schedule_alerts(recommendation, request, diagnostics),
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
    request: ScheduleRequest,
    diagnostics: DispatchDiagnostics | None = None,
) -> list[Alert]:
    """Build generated analyst alerts and schedule metadata alerts."""

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
