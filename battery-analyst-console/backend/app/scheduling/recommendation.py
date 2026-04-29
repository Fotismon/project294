from pydantic import BaseModel, Field

from app.scheduling.confidence import (
    DecisionConfidenceResult,
    evaluate_decision_confidence,
)
from app.scheduling.scoring import ScheduleScoreBreakdown, score_schedule
from app.scheduling.soc import SoCFeasibilityResult
from app.scheduling.stress import BatteryStressResult, score_battery_stress


class RecommendedSchedule(BaseModel):
    """Selected or alternative schedule with score, stress, and confidence details."""

    soc_result: SoCFeasibilityResult = Field(..., description="SoC feasibility result.")
    score: ScheduleScoreBreakdown = Field(..., description="Rule-based schedule score.")
    stress: BatteryStressResult = Field(..., description="Battery stress assessment.")
    confidence: DecisionConfidenceResult = Field(..., description="Decision confidence result.")


class FinalRecommendation(BaseModel):
    """Final recommendation assembled from scored candidate schedules."""

    decision: str = Field(..., description="Decision label for the recommendation.")
    selected: RecommendedSchedule | None = Field(
        None,
        description="Selected recommended schedule, if one exists.",
    )
    alternatives: list[RecommendedSchedule] = Field(
        default_factory=list,
        description="Alternative recommended schedules.",
    )
    explanation: list[str] = Field(..., description="Human-readable recommendation explanation.")
    hold_reasons: list[str] = Field(
        default_factory=list,
        description="Reasons for holding when no execution is recommended.",
    )


def build_recommended_schedule(
    soc_result: SoCFeasibilityResult,
    forecast_confidence: str = "medium",
    market_volatility: str = "medium",
    forecast_uncertainty_width: float | None = None,
    data_quality_level: str = "medium",
) -> RecommendedSchedule:
    """Build a recommended schedule wrapper with score, stress, and confidence."""

    score = score_schedule(
        soc_result=soc_result,
        forecast_confidence=forecast_confidence,
        market_volatility=market_volatility,
    )
    stress = score_battery_stress(soc_result)
    confidence = evaluate_decision_confidence(
        soc_result=soc_result,
        forecast_uncertainty_width=forecast_uncertainty_width,
        data_quality_level=data_quality_level,
    )

    return RecommendedSchedule(
        soc_result=soc_result,
        score=score,
        stress=stress,
        confidence=confidence,
    )


def classify_decision(
    recommended: RecommendedSchedule,
) -> tuple[str, list[str]]:
    """Classify a recommended schedule into execute, caution, watch, or hold."""

    feasible = recommended.soc_result.feasible
    final_score = recommended.score.final_score
    stress_level = recommended.stress.level
    stress_score = recommended.stress.score
    confidence_level = recommended.confidence.level
    economic_schedule = recommended.soc_result.physical_result.economic_schedule
    spread_after_efficiency = economic_schedule.spread_after_efficiency
    net_spread_after_costs = economic_schedule.net_spread_after_costs
    temperature_warning = recommended.soc_result.physical_result.temperature_warning

    if not feasible:
        return "hold", ["Schedule is not feasible."]

    if spread_after_efficiency <= 0 or net_spread_after_costs <= 0:
        return "hold", [
            "Economic spread is not attractive after efficiency and costs."
        ]

    if stress_level == "high" or stress_score >= 67:
        if confidence_level == "high" and final_score >= 70:
            return "execute_with_caution", [
                "High stress requires caution despite strong score."
            ]
        return "watch", ["High stress prevents immediate execution."]

    if confidence_level == "low":
        if final_score >= 60 and stress_level != "high":
            return "watch", ["Low confidence suggests watching instead of executing."]
        return "hold", ["Low confidence and insufficient score support holding."]

    if (
        final_score >= 70
        and confidence_level == "high"
        and stress_level in ["low", "medium"]
        and not temperature_warning
    ):
        return "execute", [
            "Strong score, acceptable stress, high confidence, and no temperature warning."
        ]

    if (
        final_score >= 45
        and confidence_level in ["medium", "high"]
        and stress_level in ["low", "medium"]
    ):
        return "execute_with_caution", [
            "Schedule is feasible and attractive but has cautionary factors."
        ]

    if final_score >= 30:
        return "watch", [
            "Schedule has some positive signal but is not strong enough to execute."
        ]

    return "hold", ["Schedule score is too weak."]


def build_final_recommendation(
    soc_results: list[SoCFeasibilityResult],
    forecast_confidence: str = "medium",
    market_volatility: str = "medium",
    forecast_uncertainty_width: float | None = None,
    data_quality_level: str = "medium",
    max_alternatives: int = 3,
) -> FinalRecommendation:
    """Build the final recommendation from candidate SoC feasibility results.

    Example:
        from app.battery.profiles import get_battery_profile
        from app.scheduling.windows import generate_rolling_windows
        from app.scheduling.pairing import pair_charge_discharge_windows
        from app.scheduling.economics import filter_economic_schedules
        from app.scheduling.constraints import filter_physical_constraints
        from app.scheduling.soc import filter_soc_feasible_schedules
        from app.scheduling.recommendation import build_final_recommendation

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
        recommendation = build_final_recommendation(
            soc_results=soc_results,
            forecast_confidence="medium_high",
            market_volatility="medium",
            forecast_uncertainty_width=25.0,
            data_quality_level="medium",
        )
    """

    if not soc_results:
        return build_hold_recommendation(
            ["No feasible schedule passed economic, physical, and SoC checks."]
        )

    recommended_schedules = [
        build_recommended_schedule(
            soc_result=soc_result,
            forecast_confidence=forecast_confidence,
            market_volatility=market_volatility,
            forecast_uncertainty_width=forecast_uncertainty_width,
            data_quality_level=data_quality_level,
        )
        for soc_result in soc_results
    ]

    recommended_schedules.sort(
        key=lambda recommended: (
            -recommended.score.final_score,
            -recommended.confidence.score,
            recommended.stress.score,
            -recommended.soc_result.physical_result.economic_schedule.net_spread_after_costs,
        )
    )

    selected = recommended_schedules[0]
    alternatives = recommended_schedules[1 : 1 + max_alternatives]
    decision, decision_reasons = classify_decision(selected)

    physical_result = selected.soc_result.physical_result
    explanation = (
        decision_reasons
        + selected.score.explanation
        + selected.stress.reasons
        + selected.confidence.reasons
        + physical_result.warning_reasons
    )

    hold_reasons: list[str] = []
    if decision == "hold":
        hold_reasons = (
            decision_reasons
            + physical_result.rejection_reasons
            + [violation.reason for violation in selected.soc_result.violations]
        )

    return FinalRecommendation(
        decision=decision,
        selected=selected,
        alternatives=alternatives,
        explanation=explanation,
        hold_reasons=hold_reasons,
    )


def build_hold_recommendation(
    reasons: list[str] | None = None,
) -> FinalRecommendation:
    """Build a hold recommendation when no executable schedule is available."""

    explanation = reasons or ["No executable schedule is currently recommended."]
    return FinalRecommendation(
        decision="hold",
        selected=None,
        alternatives=[],
        explanation=explanation,
        hold_reasons=explanation,
    )
