from app.battery.profiles import BatteryOperatingProfile, get_battery_profile
from app.scheduling.dispatch import (
    build_dispatch_plan_from_windows,
    select_primary_charge_window,
    select_primary_discharge_window,
    select_profitable_dispatch_windows,
)
from app.scheduling.profitability import build_hurdle_explanation_lines
from app.scheduling.windows import generate_rolling_windows


def load_example_profile() -> BatteryOperatingProfile:
    try:
        return get_battery_profile("greece_100mw_300mwh")
    except ValueError:
        print("greece_100mw_300mwh profile not found; using inline equivalent profile.")
        return BatteryOperatingProfile(
            name="greece_100mw_300mwh",
            power_mw=100,
            capacity_mwh=300,
            duration_hours=3,
            round_trip_efficiency=0.85,
            max_cycles_per_day=1.5,
            soc_min=0.1,
            soc_max=0.9,
            initial_soc=0.5,
            target_terminal_soc=0.5,
            min_action_duration_minutes=15,
            max_action_duration_minutes=240,
            min_rest_between_actions_minutes=15,
            temperature_warning_c=30,
            temperature_avoid_c=40,
            degradation_cost_eur_per_mwh=20,
            auxiliary_load_percent=0.02,
            ramp_rate_mw_per_interval=100,
            grid_connection_limit_mw=100,
        )


def main() -> None:
    profile = load_example_profile()
    prices = [70.0] * 96
    prices[44:46] = [30.0] * 2
    prices[68:70] = [80.0] * 2
    prices[80:82] = [120.0] * 2

    windows = generate_rolling_windows(
        prices,
        window_durations_minutes=[30],
    )
    charge_windows, discharge_windows, explanation = select_profitable_dispatch_windows(
        windows=windows,
        profile=profile,
        max_charge_blocks=1,
        max_discharge_blocks=2,
    )
    plan = build_dispatch_plan_from_windows(
        charge_windows=charge_windows,
        discharge_windows=discharge_windows,
        prices=prices,
        profile=profile,
    )

    primary_charge = select_primary_charge_window(plan.charge_blocks)
    primary_discharge = select_primary_discharge_window(plan.discharge_blocks)

    assert len(charge_windows) == 1
    assert len(discharge_windows) >= 2
    assert any(window.avg_price == 80.0 for window in discharge_windows)
    assert any(window.avg_price == 120.0 for window in discharge_windows)
    assert primary_charge is not None
    assert primary_discharge is not None
    assert primary_charge.avg_price == 30.0
    assert primary_discharge.avg_price == 120.0
    assert profile.soc_min <= min(plan.soc_trajectory) <= profile.soc_max
    assert profile.soc_min <= max(plan.soc_trajectory) <= profile.soc_max

    print("Selected charge blocks:")
    for block in plan.charge_blocks:
        print(f"- {block.start}-{block.end}, {block.avg_price:.2f} €/MWh, {block.energy_mwh:.2f} MWh")

    print("Selected discharge blocks:")
    for block in plan.discharge_blocks:
        print(f"- {block.start}-{block.end}, {block.avg_price:.2f} €/MWh, {block.energy_mwh:.2f} MWh")

    print("Hurdle explanation for primary discharge:")
    for line in build_hurdle_explanation_lines(
        charge_price=primary_charge.avg_price,
        discharge_price=primary_discharge.avg_price,
        round_trip_efficiency=profile.round_trip_efficiency,
        degradation_cost_eur_per_mwh=profile.degradation_cost_eur_per_mwh,
    ):
        print(f"- {line}")

    print("V1.2 dispatch explanation:")
    for line in explanation:
        print(f"- {line}")

    print(f"total_mwh_charged: {plan.total_mwh_charged:.2f}")
    print(f"total_mwh_discharged: {plan.total_mwh_discharged:.2f}")
    print(f"equivalent_full_cycles: {plan.equivalent_full_cycles:.4f}")
    print(f"SoC start/end/min/max: {plan.soc_trajectory[0]:.4f} / {plan.soc_trajectory[-1]:.4f} / {min(plan.soc_trajectory):.4f} / {max(plan.soc_trajectory):.4f}")
    print("Window V1.2 example passed.")


if __name__ == "__main__":
    main()
