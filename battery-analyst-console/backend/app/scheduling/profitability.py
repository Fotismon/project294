from pydantic import BaseModel, Field


class HurdleCostResult(BaseModel):
    charge_price_eur_per_mwh: float = Field(
        ...,
        description="Charge energy price in EUR/MWh.",
    )
    round_trip_efficiency: float = Field(
        ...,
        description="Battery round-trip efficiency fraction.",
    )
    degradation_cost_eur_per_mwh: float = Field(
        ...,
        description="Battery degradation cost in EUR/MWh.",
    )
    energy_input_required_mwh: float = Field(
        ...,
        description="Input MWh required to deliver 1 MWh after efficiency.",
    )
    rte_adjusted_charge_cost_eur_per_mwh: float = Field(
        ...,
        description="Charge cost adjusted for round-trip efficiency.",
    )
    total_hurdle_cost_eur_per_mwh: float = Field(
        ...,
        description="RTE-adjusted charge cost plus degradation cost.",
    )


class DischargeProfitabilityResult(BaseModel):
    discharge_price_eur_per_mwh: float = Field(
        ...,
        description="Discharge energy price in EUR/MWh.",
    )
    hurdle: HurdleCostResult = Field(
        ...,
        description="Hurdle-cost calculation for the charge side.",
    )
    net_profit_eur_per_mwh: float = Field(
        ...,
        description="Discharge price minus total hurdle cost.",
    )
    profitable: bool = Field(
        ...,
        description="Whether discharge price clears the hurdle cost.",
    )


def calculate_hurdle_cost_per_mwh(
    charge_price: float,
    round_trip_efficiency: float,
    degradation_cost_eur_per_mwh: float,
) -> HurdleCostResult:
    if charge_price < 0:
        raise ValueError("charge_price must be greater than or equal to 0.")
    if round_trip_efficiency <= 0 or round_trip_efficiency > 1:
        raise ValueError("round_trip_efficiency must be greater than 0 and <= 1.")
    if degradation_cost_eur_per_mwh < 0:
        raise ValueError(
            "degradation_cost_eur_per_mwh must be greater than or equal to 0."
        )

    energy_input_required_mwh = 1 / round_trip_efficiency
    rte_adjusted_charge_cost = charge_price / round_trip_efficiency
    total_hurdle_cost = rte_adjusted_charge_cost + degradation_cost_eur_per_mwh

    return HurdleCostResult(
        charge_price_eur_per_mwh=round(charge_price, 2),
        round_trip_efficiency=round(round_trip_efficiency, 4),
        degradation_cost_eur_per_mwh=round(degradation_cost_eur_per_mwh, 2),
        energy_input_required_mwh=round(energy_input_required_mwh, 4),
        rte_adjusted_charge_cost_eur_per_mwh=round(rte_adjusted_charge_cost, 2),
        total_hurdle_cost_eur_per_mwh=round(total_hurdle_cost, 2),
    )


def calculate_net_profit_per_mwh(
    charge_price: float,
    discharge_price: float,
    round_trip_efficiency: float,
    degradation_cost_eur_per_mwh: float,
) -> float:
    if discharge_price < 0:
        raise ValueError("discharge_price must be greater than or equal to 0.")

    hurdle = calculate_hurdle_cost_per_mwh(
        charge_price=charge_price,
        round_trip_efficiency=round_trip_efficiency,
        degradation_cost_eur_per_mwh=degradation_cost_eur_per_mwh,
    )
    return round(discharge_price - hurdle.total_hurdle_cost_eur_per_mwh, 2)


def evaluate_discharge_profitability(
    charge_price: float,
    discharge_price: float,
    round_trip_efficiency: float,
    degradation_cost_eur_per_mwh: float,
) -> DischargeProfitabilityResult:
    if discharge_price < 0:
        raise ValueError("discharge_price must be greater than or equal to 0.")

    hurdle = calculate_hurdle_cost_per_mwh(
        charge_price=charge_price,
        round_trip_efficiency=round_trip_efficiency,
        degradation_cost_eur_per_mwh=degradation_cost_eur_per_mwh,
    )
    net_profit = calculate_net_profit_per_mwh(
        charge_price=charge_price,
        discharge_price=discharge_price,
        round_trip_efficiency=round_trip_efficiency,
        degradation_cost_eur_per_mwh=degradation_cost_eur_per_mwh,
    )

    return DischargeProfitabilityResult(
        discharge_price_eur_per_mwh=round(discharge_price, 2),
        hurdle=hurdle,
        net_profit_eur_per_mwh=net_profit,
        profitable=net_profit > 0,
    )


def build_hurdle_explanation_lines(
    charge_price: float,
    discharge_price: float,
    round_trip_efficiency: float,
    degradation_cost_eur_per_mwh: float,
) -> list[str]:
    result = evaluate_discharge_profitability(
        charge_price=charge_price,
        discharge_price=discharge_price,
        round_trip_efficiency=round_trip_efficiency,
        degradation_cost_eur_per_mwh=degradation_cost_eur_per_mwh,
    )
    hurdle = result.hurdle
    difference = abs(result.net_profit_eur_per_mwh)

    if result.profitable:
        profitability_line = (
            f"Discharge window clears hurdle by {difference:.2f} €/MWh."
        )
    else:
        profitability_line = (
            f"Discharge window misses hurdle by {difference:.2f} €/MWh."
        )

    return [
        (
            "Charge price adjusted for RTE: "
            f"{hurdle.rte_adjusted_charge_cost_eur_per_mwh:.2f} €/MWh."
        ),
        f"Degradation cost: {hurdle.degradation_cost_eur_per_mwh:.2f} €/MWh.",
        f"Total hurdle cost: {hurdle.total_hurdle_cost_eur_per_mwh:.2f} €/MWh.",
        profitability_line,
    ]
