from app.scheduling.profitability import calculate_net_profit_per_mwh


def assert_close(actual: float, expected: float) -> None:
    assert abs(actual - expected) < 0.01, f"Expected {expected}, received {actual}."


def print_example(round_trip_efficiency: float, expected_low: float, expected_high: float) -> None:
    low_profit = calculate_net_profit_per_mwh(
        charge_price=30,
        discharge_price=80,
        round_trip_efficiency=round_trip_efficiency,
        degradation_cost_eur_per_mwh=20,
    )
    high_profit = calculate_net_profit_per_mwh(
        charge_price=30,
        discharge_price=120,
        round_trip_efficiency=round_trip_efficiency,
        degradation_cost_eur_per_mwh=20,
    )

    assert_close(low_profit, expected_low)
    assert_close(high_profit, expected_high)

    print(f"RTE {round_trip_efficiency:.2f}:")
    print(f"- discharge 80 net profit: {low_profit:.2f} €/MWh")
    print(f"- discharge 120 net profit: {high_profit:.2f} €/MWh")


def main() -> None:
    print_example(round_trip_efficiency=0.85, expected_low=24.71, expected_high=64.71)
    print()
    print_example(round_trip_efficiency=0.90, expected_low=26.67, expected_high=66.67)
    print()
    print("✅ Profitability example passed.")


if __name__ == "__main__":
    main()
