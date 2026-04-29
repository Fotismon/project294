from pydantic import BaseModel, Field

from app.scheduling.soc import SoCFeasibilityResult


class ScheduleScoreBreakdown(BaseModel):
    """Transparent rule-based score and factor breakdown for a candidate schedule."""

    spread_quality: float = Field(..., description="Score contribution from economic spread.")
    confidence_bonus: float = Field(..., description="Bonus from forecast confidence.")
    temperature_penalty: float = Field(..., description="Penalty from temperature risk.")
    battery_stress_penalty: float = Field(
        ...,
        description="Penalty from EFC, SoC swing, and SoC violations.",
    )
    uncertainty_penalty: float = Field(
        ...,
        description="Penalty from forecast confidence and market volatility.",
    )
    final_score: float = Field(..., description="Final clamped schedule score.")
    explanation: list[str] = Field(..., description="Human-readable scoring factors.")


def score_spread_quality(spread_after_efficiency: float) -> float:
    """Convert spread after efficiency into a bounded score contribution."""

    if spread_after_efficiency <= 0:
        return 0.0

    if spread_after_efficiency >= 100:
        return 50.0

    return round(spread_after_efficiency * 0.5, 2)


def score_confidence_bonus(forecast_confidence: str = "medium") -> float:
    """Map forecast confidence into a simple bonus score."""

    confidence_bonus_by_label = {
        "low": 0.0,
        "medium": 5.0,
        "medium_high": 8.0,
        "high": 10.0,
    }
    return confidence_bonus_by_label.get(forecast_confidence, 5.0)


def score_temperature_penalty(soc_result: SoCFeasibilityResult) -> float:
    """Score the temperature risk penalty from physical constraint flags."""

    if not soc_result.physical_result.temperature_ok:
        return 20.0

    if soc_result.physical_result.temperature_warning:
        return 8.0

    return 0.0


def score_battery_stress_penalty(soc_result: SoCFeasibilityResult) -> float:
    """Score a lightweight battery stress penalty from EFC and SoC swing."""

    penalty = 0.0
    equivalent_full_cycles = soc_result.equivalent_full_cycles
    soc_swing = soc_result.max_soc_reached - soc_result.min_soc_reached

    if equivalent_full_cycles > 1.0:
        penalty += 15
    elif equivalent_full_cycles > 0.75:
        penalty += 10
    elif equivalent_full_cycles > 0.5:
        penalty += 5

    if soc_swing > 0.8:
        penalty += 10
    elif soc_swing > 0.6:
        penalty += 5

    if soc_result.violations:
        penalty += 25

    return round(penalty, 2)


def score_uncertainty_penalty(
    forecast_confidence: str = "medium",
    market_volatility: str = "medium",
) -> float:
    """Score uncertainty penalty from forecast confidence and market volatility."""

    confidence_penalty_by_label = {
        "high": 0.0,
        "medium_high": 2.0,
        "medium": 5.0,
        "low": 10.0,
    }
    volatility_penalty_by_label = {
        "low": 0.0,
        "medium": 3.0,
        "high": 8.0,
    }
    return (
        confidence_penalty_by_label.get(forecast_confidence, 5.0)
        + volatility_penalty_by_label.get(market_volatility, 3.0)
    )


def score_schedule(
    soc_result: SoCFeasibilityResult,
    forecast_confidence: str = "medium",
    market_volatility: str = "medium",
) -> ScheduleScoreBreakdown:
    """Score a single SoC feasibility result with transparent rule-based factors.

    Example:
        from app.battery.profiles import get_battery_profile
        from app.scheduling.windows import generate_rolling_windows
        from app.scheduling.pairing import pair_charge_discharge_windows
        from app.scheduling.economics import filter_economic_schedules
        from app.scheduling.constraints import filter_physical_constraints
        from app.scheduling.soc import filter_soc_feasible_schedules
        from app.scheduling.scoring import score_schedule

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
        score = score_schedule(
            soc_result=soc_results[0],
            forecast_confidence="medium_high",
            market_volatility="medium",
        )
    """

    spread_after_efficiency = (
        soc_result.physical_result.economic_schedule.spread_after_efficiency
    )
    spread_quality = score_spread_quality(spread_after_efficiency)
    confidence_bonus = score_confidence_bonus(forecast_confidence)
    temperature_penalty = score_temperature_penalty(soc_result)
    battery_stress_penalty = score_battery_stress_penalty(soc_result)
    uncertainty_penalty = score_uncertainty_penalty(
        forecast_confidence=forecast_confidence,
        market_volatility=market_volatility,
    )

    final_score = (
        spread_quality
        + confidence_bonus
        - temperature_penalty
        - battery_stress_penalty
        - uncertainty_penalty
    )
    final_score = max(0.0, min(100.0, final_score))

    explanation = [
        f"Spread after efficiency contributes {spread_quality:.2f} points.",
        f"Forecast confidence '{forecast_confidence}' adds {confidence_bonus:.2f} points.",
    ]

    if temperature_penalty:
        if soc_result.physical_result.temperature_ok:
            explanation.append(
                f"Temperature warning subtracts {temperature_penalty:.2f} points."
            )
        else:
            explanation.append(
                f"Temperature avoid threshold subtracts {temperature_penalty:.2f} points."
            )
    else:
        explanation.append("Temperature risk subtracts 0.00 points.")

    explanation.extend(
        [
            (
                f"Battery stress penalty is {battery_stress_penalty:.2f} points "
                "based on EFC and SoC swing."
            ),
            (
                f"Uncertainty penalty is {uncertainty_penalty:.2f} points "
                "based on confidence and volatility."
            ),
        ]
    )

    if not soc_result.feasible:
        final_score = min(final_score, 30.0)
        explanation.append("Schedule is not fully feasible, so score is capped.")

    return ScheduleScoreBreakdown(
        spread_quality=round(spread_quality, 2),
        confidence_bonus=round(confidence_bonus, 2),
        temperature_penalty=round(temperature_penalty, 2),
        battery_stress_penalty=round(battery_stress_penalty, 2),
        uncertainty_penalty=round(uncertainty_penalty, 2),
        final_score=round(final_score, 2),
        explanation=explanation,
    )


def score_schedules(
    soc_results: list[SoCFeasibilityResult],
    forecast_confidence: str = "medium",
    market_volatility: str = "medium",
    max_results: int | None = None,
) -> list[ScheduleScoreBreakdown]:
    """Score and rank multiple SoC feasibility results."""

    scored = [
        score_schedule(
            soc_result=soc_result,
            forecast_confidence=forecast_confidence,
            market_volatility=market_volatility,
        )
        for soc_result in soc_results
    ]
    scored.sort(key=lambda score: -score.final_score)

    if max_results is not None:
        return scored[:max_results]

    return scored
