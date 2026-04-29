from pydantic import BaseModel, Field

from app.scheduling.soc import SoCFeasibilityResult


class BatteryStressResult(BaseModel):
    """Transparent MVP battery stress score for a candidate schedule."""

    level: str = Field(..., description="Stress level: low, medium, or high.")
    score: int = Field(..., description="Stress score from 0 to 100.")
    reasons: list[str] = Field(..., description="Human-readable stress reasons.")
    efc: float = Field(..., description="Equivalent full cycles for the schedule.")
    temperature_risk: str = Field(..., description="Temperature risk classification.")
    duration_intensity: str = Field(..., description="Action duration intensity classification.")
    rapid_switching_risk: bool = Field(..., description="Whether short rest creates switching risk.")
    weak_spread_risk: bool = Field(..., description="Whether weak spread creates execution risk.")


def classify_stress_level(score: int) -> str:
    """Classify a clamped numeric stress score as low, medium, or high."""

    clamped_score = max(0, min(100, score))
    if clamped_score <= 33:
        return "low"
    if clamped_score <= 66:
        return "medium"
    return "high"


def score_efc_stress(equivalent_full_cycles: float) -> tuple[int, list[str]]:
    """Score stress contribution from equivalent full cycles."""

    if equivalent_full_cycles < 0:
        raise ValueError("equivalent_full_cycles must be greater than or equal to 0.")

    if equivalent_full_cycles <= 0.5:
        return 5, ["low cycle usage"]
    if equivalent_full_cycles <= 1.0:
        return 20, ["moderate cycle usage"]
    return 35, ["high cycle usage above one equivalent full cycle"]


def score_temperature_stress(
    soc_result: SoCFeasibilityResult,
) -> tuple[int, str, list[str]]:
    """Score stress contribution from physical temperature risk flags."""

    if not soc_result.physical_result.temperature_ok:
        return 35, "high", ["temperature avoid threshold reached"]

    if soc_result.physical_result.temperature_warning:
        return 15, "medium", ["temperature warning during charge or discharge window"]

    return 0, "low", ["temperature within safe range"]


def score_duration_intensity(
    soc_result: SoCFeasibilityResult,
) -> tuple[int, str, list[str]]:
    """Score stress contribution from total charge and discharge action duration."""

    candidate = soc_result.physical_result.economic_schedule.candidate
    total_action_minutes = (
        candidate.charge_window.duration_minutes
        + candidate.discharge_window.duration_minutes
    )

    if total_action_minutes <= 120:
        return 5, "low", ["short total action duration"]
    if total_action_minutes <= 360:
        return 15, "medium", ["moderate total action duration"]
    return 25, "high", ["long total action duration"]


def score_rapid_switching_stress(
    soc_result: SoCFeasibilityResult,
    rapid_switching_rest_threshold_minutes: int = 60,
) -> tuple[int, bool, list[str]]:
    """Score stress contribution from short rest between charge and discharge."""

    rest_minutes = soc_result.physical_result.economic_schedule.candidate.rest_minutes
    if rest_minutes < rapid_switching_rest_threshold_minutes:
        return 20, True, [
            "short rest between charge and discharge indicates rapid switching risk"
        ]

    return 0, False, ["sufficient rest between charge and discharge"]


def score_weak_spread_stress(
    soc_result: SoCFeasibilityResult,
    weak_spread_threshold_eur_per_mwh: float = 20.0,
) -> tuple[int, bool, list[str]]:
    """Score stress contribution from weak economic spread."""

    spread_after_efficiency = (
        soc_result.physical_result.economic_schedule.spread_after_efficiency
    )
    if spread_after_efficiency < weak_spread_threshold_eur_per_mwh:
        return 15, True, ["weak economic spread increases execution risk"]

    return 0, False, ["economic spread is strong enough"]


def score_battery_stress(
    soc_result: SoCFeasibilityResult,
    rapid_switching_rest_threshold_minutes: int = 60,
    weak_spread_threshold_eur_per_mwh: float = 20.0,
) -> BatteryStressResult:
    """Score battery stress from EFC, temperature, duration, rest, and spread.

    Example:
        from app.battery.profiles import get_battery_profile
        from app.scheduling.windows import generate_rolling_windows
        from app.scheduling.pairing import pair_charge_discharge_windows
        from app.scheduling.economics import filter_economic_schedules
        from app.scheduling.constraints import filter_physical_constraints
        from app.scheduling.soc import filter_soc_feasible_schedules
        from app.scheduling.stress import score_battery_stress

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
        stress = score_battery_stress(soc_results[0])
    """

    efc_points, efc_reasons = score_efc_stress(soc_result.equivalent_full_cycles)
    temperature_points, temperature_risk, temperature_reasons = score_temperature_stress(
        soc_result
    )
    duration_points, duration_intensity, duration_reasons = score_duration_intensity(
        soc_result
    )
    rapid_points, rapid_switching_risk, rapid_reasons = score_rapid_switching_stress(
        soc_result=soc_result,
        rapid_switching_rest_threshold_minutes=rapid_switching_rest_threshold_minutes,
    )
    weak_spread_points, weak_spread_risk, weak_spread_reasons = score_weak_spread_stress(
        soc_result=soc_result,
        weak_spread_threshold_eur_per_mwh=weak_spread_threshold_eur_per_mwh,
    )

    score = (
        efc_points
        + temperature_points
        + duration_points
        + rapid_points
        + weak_spread_points
    )
    reasons = (
        efc_reasons
        + temperature_reasons
        + duration_reasons
        + rapid_reasons
        + weak_spread_reasons
    )

    if not soc_result.feasible:
        score += 25
        reasons.append("SoC feasibility issues increase stress risk")

    final_score = max(0, min(100, int(score)))
    return BatteryStressResult(
        level=classify_stress_level(final_score),
        score=final_score,
        reasons=reasons,
        efc=soc_result.equivalent_full_cycles,
        temperature_risk=temperature_risk,
        duration_intensity=duration_intensity,
        rapid_switching_risk=rapid_switching_risk,
        weak_spread_risk=weak_spread_risk,
    )


def score_battery_stress_for_schedules(
    soc_results: list[SoCFeasibilityResult],
    rapid_switching_rest_threshold_minutes: int = 60,
    weak_spread_threshold_eur_per_mwh: float = 20.0,
    max_results: int | None = None,
) -> list[BatteryStressResult]:
    """Score and rank multiple schedules by battery stress, lowest stress first."""

    scored = [
        score_battery_stress(
            soc_result=soc_result,
            rapid_switching_rest_threshold_minutes=rapid_switching_rest_threshold_minutes,
            weak_spread_threshold_eur_per_mwh=weak_spread_threshold_eur_per_mwh,
        )
        for soc_result in soc_results
    ]
    scored.sort(key=lambda result: result.score)

    if max_results is not None:
        return scored[:max_results]

    return scored
