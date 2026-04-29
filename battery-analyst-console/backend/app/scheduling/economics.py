from pydantic import BaseModel, Field

from app.battery.profiles import BatteryOperatingProfile
from app.scheduling.pairing import CandidateSchedule


REJECTION_REASON_SPREAD_TOO_LOW = (
    "Spread after efficiency does not exceed degradation cost plus minimum margin."
)


class EconomicSchedule(BaseModel):
    """Candidate schedule with economic viability calculations."""

    candidate: CandidateSchedule = Field(..., description="Paired candidate schedule.")
    adjusted_charge_price: float = Field(
        ...,
        description="Charge average price adjusted for round-trip efficiency.",
    )
    spread_after_efficiency: float = Field(
        ...,
        description="Discharge average price minus adjusted charge price.",
    )
    degradation_cost_eur_per_mwh: float = Field(
        ...,
        description="Battery degradation cost applied per MWh.",
    )
    minimum_margin_eur_per_mwh: float = Field(
        ...,
        description="Minimum required economic margin per MWh.",
    )
    net_spread_after_costs: float = Field(
        ...,
        description="Spread after efficiency minus degradation cost and minimum margin.",
    )
    economically_feasible: bool = Field(
        ...,
        description="Whether the schedule exceeds the economic threshold.",
    )
    rejection_reason: str | None = Field(
        None,
        description="Reason the schedule was rejected, if not economically feasible.",
    )


def evaluate_schedule_economics(
    candidate: CandidateSchedule,
    profile: BatteryOperatingProfile,
    minimum_margin_eur_per_mwh: float = 0.0,
) -> EconomicSchedule:
    """Evaluate one candidate schedule against efficiency and economic costs."""

    if profile.round_trip_efficiency <= 0:
        raise ValueError("profile.round_trip_efficiency must be greater than 0.")

    if minimum_margin_eur_per_mwh < 0:
        raise ValueError("minimum_margin_eur_per_mwh must be greater than or equal to 0.")

    adjusted_charge_price = candidate.charge_avg_price / profile.round_trip_efficiency
    spread_after_efficiency = candidate.discharge_avg_price - adjusted_charge_price
    economic_threshold = (
        profile.degradation_cost_eur_per_mwh + minimum_margin_eur_per_mwh
    )
    net_spread_after_costs = spread_after_efficiency - economic_threshold
    economically_feasible = spread_after_efficiency > economic_threshold

    return EconomicSchedule(
        candidate=candidate,
        adjusted_charge_price=round(adjusted_charge_price, 2),
        spread_after_efficiency=round(spread_after_efficiency, 2),
        degradation_cost_eur_per_mwh=round(profile.degradation_cost_eur_per_mwh, 2),
        minimum_margin_eur_per_mwh=round(minimum_margin_eur_per_mwh, 2),
        net_spread_after_costs=round(net_spread_after_costs, 2),
        economically_feasible=economically_feasible,
        rejection_reason=None if economically_feasible else REJECTION_REASON_SPREAD_TOO_LOW,
    )


def filter_economic_schedules(
    candidates: list[CandidateSchedule],
    profile: BatteryOperatingProfile,
    minimum_margin_eur_per_mwh: float = 0.0,
    keep_rejected: bool = False,
    max_results: int | None = None,
) -> list[EconomicSchedule]:
    """Evaluate, filter, and rank candidate schedules by economic viability.

    Example:
        from app.battery.profiles import get_battery_profile
        from app.scheduling.windows import generate_rolling_windows
        from app.scheduling.pairing import pair_charge_discharge_windows
        from app.scheduling.economics import filter_economic_schedules

        prices = [80.0] * 96
        prices[44:52] = [35.0] * 8
        prices[80:88] = [120.0] * 8

        profile = get_battery_profile("balanced")
        windows = generate_rolling_windows(prices)
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
            max_results=5,
        )
    """

    evaluated = [
        evaluate_schedule_economics(
            candidate=candidate,
            profile=profile,
            minimum_margin_eur_per_mwh=minimum_margin_eur_per_mwh,
        )
        for candidate in candidates
    ]

    if not keep_rejected:
        evaluated = [
            schedule for schedule in evaluated if schedule.economically_feasible
        ]

    evaluated.sort(
        key=lambda schedule: (
            not schedule.economically_feasible,
            -schedule.net_spread_after_costs,
            -schedule.spread_after_efficiency,
            schedule.adjusted_charge_price,
        )
    )

    if max_results is not None:
        return evaluated[:max_results]

    return evaluated
