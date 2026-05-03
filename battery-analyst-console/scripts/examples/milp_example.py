import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from app.battery.profiles import BatteryOperatingProfile, get_battery_profile
from app.scheduling.milp import solve_milp_dispatch


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
            degradation_cost_eur_per_mwh=5,
            auxiliary_load_percent=0.02,
            ramp_rate_mw_per_interval=100,
            grid_connection_limit_mw=100,
        )


def main() -> None:
    profile = load_example_profile()
    prices = [60.0] * 96
    prices[44:56] = [30.0] * 12
    prices[72:80] = [80.0] * 8
    prices[84:88] = [120.0] * 4

    terminal_soc_tolerance = 0.01
    result = solve_milp_dispatch(
        prices=prices,
        profile=profile,
        terminal_soc_tolerance=terminal_soc_tolerance,
    )

    if not result.feasible:
        print(f"MILP dispatch example failed: {result.solver_status}")
        if result.error_message:
            print(result.error_message)
        for line in result.explanation:
            print(line)
        raise SystemExit(1)

    diagnostics = result.diagnostics
    assert diagnostics is not None
    low_charge = sum(result.charge_power_mw[44:56])
    discharge_80 = sum(result.discharge_power_mw[72:80])
    discharge_120 = sum(result.discharge_power_mw[84:88])

    assert result.solver_status == "Optimal"
    assert low_charge > 0
    assert discharge_80 > 0
    assert discharge_120 > 0
    assert min(result.soc_trajectory) >= profile.soc_min - 1e-4
    assert max(result.soc_trajectory) <= profile.soc_max + 1e-4
    assert diagnostics.simultaneous_action_violations == 0
    assert diagnostics.equivalent_full_cycles <= profile.max_cycles_per_day + 1e-4
    assert diagnostics.terminal_soc_error <= terminal_soc_tolerance + 1e-4

    print(f"solver_status: {result.solver_status}")
    print(f"objective_value: {result.objective_value:.2f} EUR")
    print(f"total_mwh_charged: {diagnostics.total_mwh_charged:.2f}")
    print(f"total_mwh_discharged: {diagnostics.total_mwh_discharged:.2f}")
    print(f"equivalent_full_cycles: {diagnostics.equivalent_full_cycles:.4f}")
    print(
        "SoC min/max/end: "
        f"{min(result.soc_trajectory):.4f} / "
        f"{max(result.soc_trajectory):.4f} / "
        f"{result.soc_trajectory[-1]:.4f}"
    )
    print(
        "simultaneous_action_violations: "
        f"{diagnostics.simultaneous_action_violations}"
    )
    print(f"grid_connection_limit_ok: {diagnostics.grid_connection_limit_ok}")
    print("✅ MILP dispatch example passed.")


if __name__ == "__main__":
    main()
