from pydantic import BaseModel, Field

from app.scheduling.soc import SoCFeasibilityResult


class DecisionConfidenceResult(BaseModel):
    """Explainable MVP confidence score for a candidate schedule decision."""

    level: str = Field(..., description="Confidence level: low, medium, or high.")
    score: int = Field(..., description="Confidence score from 0 to 100.")
    reasons: list[str] = Field(..., description="Human-readable confidence reasons.")
    spread_strength: str = Field(..., description="Spread strength classification.")
    forecast_uncertainty_width: float | None = Field(
        None,
        description="Average forecast band width in EUR/MWh, if provided.",
    )
    data_quality_level: str = Field(..., description="Data quality level used for confidence.")
    temperature_risk: str = Field(..., description="Temperature risk classification.")
    soc_feasible: bool = Field(..., description="Whether SoC feasibility passed.")


def classify_confidence_level(score: int) -> str:
    """Classify a clamped numeric confidence score as low, medium, or high."""

    clamped_score = max(0, min(100, score))
    if clamped_score <= 39:
        return "low"
    if clamped_score <= 74:
        return "medium"
    return "high"


def classify_spread_strength(
    spread_after_efficiency: float,
) -> tuple[str, int, list[str]]:
    """Classify spread strength and return its confidence contribution."""

    if spread_after_efficiency >= 70:
        return "strong", 30, ["Strong spread after efficiency supports confidence."]
    if spread_after_efficiency >= 30:
        return "moderate", 18, [
            "Moderate spread after efficiency provides some confidence."
        ]
    return "weak", 5, ["Weak spread after efficiency lowers confidence."]


def score_forecast_uncertainty(
    forecast_uncertainty_width: float | None = None,
) -> tuple[int, list[str]]:
    """Score confidence contribution from forecast uncertainty width."""

    if forecast_uncertainty_width is None:
        return 12, ["Forecast uncertainty was not provided; using neutral confidence."]
    if forecast_uncertainty_width <= 20:
        return 25, ["Narrow forecast uncertainty supports confidence."]
    if forecast_uncertainty_width <= 50:
        return 12, ["Moderate forecast uncertainty limits confidence."]
    return 0, ["Wide forecast uncertainty lowers confidence."]


def score_data_quality(data_quality_level: str = "medium") -> tuple[int, list[str]]:
    """Score confidence contribution from data quality level."""

    if data_quality_level == "high":
        return 20, ["High data quality supports confidence."]
    if data_quality_level == "low":
        return 3, ["Low data quality lowers confidence."]
    return 12, ["Medium data quality provides acceptable confidence."]


def score_temperature_confidence(
    soc_result: SoCFeasibilityResult,
) -> tuple[str, int, list[str]]:
    """Score confidence contribution from temperature risk."""

    if not soc_result.physical_result.temperature_ok:
        return "high", 0, ["Temperature avoid threshold lowers confidence."]
    if soc_result.physical_result.temperature_warning:
        return "medium", 8, ["Temperature warning reduces confidence."]
    return "low", 15, ["Temperature conditions support confidence."]


def score_soc_confidence(
    soc_result: SoCFeasibilityResult,
) -> tuple[int, list[str]]:
    """Score confidence contribution from SoC feasibility."""

    if soc_result.feasible and not soc_result.violations:
        return 10, ["SoC feasibility supports confidence."]
    return 0, ["SoC feasibility issues lower confidence."]


def evaluate_decision_confidence(
    soc_result: SoCFeasibilityResult,
    forecast_uncertainty_width: float | None = None,
    data_quality_level: str = "medium",
) -> DecisionConfidenceResult:
    """Evaluate explainable decision confidence for one SoC-feasible schedule.

    Example:
        from app.battery.profiles import get_battery_profile
        from app.scheduling.windows import generate_rolling_windows
        from app.scheduling.pairing import pair_charge_discharge_windows
        from app.scheduling.economics import filter_economic_schedules
        from app.scheduling.constraints import filter_physical_constraints
        from app.scheduling.soc import filter_soc_feasible_schedules
        from app.scheduling.confidence import evaluate_decision_confidence

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
        confidence = evaluate_decision_confidence(
            soc_result=soc_results[0],
            forecast_uncertainty_width=25.0,
            data_quality_level="medium",
        )
    """

    spread_after_efficiency = (
        soc_result.physical_result.economic_schedule.spread_after_efficiency
    )
    spread_strength, spread_score, spread_reasons = classify_spread_strength(
        spread_after_efficiency
    )
    uncertainty_score, uncertainty_reasons = score_forecast_uncertainty(
        forecast_uncertainty_width
    )
    data_quality_score, data_quality_reasons = score_data_quality(data_quality_level)
    temperature_risk, temperature_score, temperature_reasons = score_temperature_confidence(
        soc_result
    )
    soc_score, soc_reasons = score_soc_confidence(soc_result)

    score = (
        spread_score
        + uncertainty_score
        + data_quality_score
        + temperature_score
        + soc_score
    )
    final_score = max(0, min(100, int(score)))

    reasons = (
        spread_reasons
        + uncertainty_reasons
        + data_quality_reasons
        + temperature_reasons
        + soc_reasons
    )

    return DecisionConfidenceResult(
        level=classify_confidence_level(final_score),
        score=final_score,
        reasons=reasons,
        spread_strength=spread_strength,
        forecast_uncertainty_width=forecast_uncertainty_width,
        data_quality_level=data_quality_level
        if data_quality_level in {"high", "medium", "low"}
        else "medium",
        temperature_risk=temperature_risk,
        soc_feasible=soc_result.feasible,
    )


def evaluate_decision_confidence_for_schedules(
    soc_results: list[SoCFeasibilityResult],
    forecast_uncertainty_width: float | None = None,
    data_quality_level: str = "medium",
    max_results: int | None = None,
) -> list[DecisionConfidenceResult]:
    """Evaluate and rank decision confidence for multiple schedules."""

    confidence_results = [
        evaluate_decision_confidence(
            soc_result=soc_result,
            forecast_uncertainty_width=forecast_uncertainty_width,
            data_quality_level=data_quality_level,
        )
        for soc_result in soc_results
    ]
    confidence_results.sort(key=lambda result: -result.score)

    if max_results is not None:
        return confidence_results[:max_results]

    return confidence_results
