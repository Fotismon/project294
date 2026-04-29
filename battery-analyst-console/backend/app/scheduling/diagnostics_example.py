from app.battery.profiles import get_battery_profile
from app.scheduling.diagnostics import compute_dispatch_diagnostics
from app.scheduling.dispatch import build_dispatch_plan_from_windows
from app.scheduling.windows import generate_rolling_windows


def main() -> None:
    profile = get_battery_profile("greece_100mw_300mwh")
    prices = [70.0] * 96
    prices[44:48] = [30.0] * 4
    prices[80:84] = [120.0] * 4

    windows = generate_rolling_windows(prices, window_durations_minutes=[60])
    charge_window = min(windows, key=lambda window: window.avg_price)
    discharge_window = max(windows, key=lambda window: window.avg_price)
    plan = build_dispatch_plan_from_windows(
        charge_windows=[charge_window],
        discharge_windows=[discharge_window],
        prices=prices,
        profile=profile,
    )
    diagnostics = compute_dispatch_diagnostics(
        charge_power_mw=plan.charge_power_mw,
        discharge_power_mw=plan.discharge_power_mw,
        soc_trajectory=plan.soc_trajectory,
        profile=profile,
    )

    assert diagnostics.simultaneous_action_violations == 0
    assert diagnostics.grid_connection_limit_ok is True
    assert diagnostics.equivalent_full_cycles > 0

    print(diagnostics.model_dump())
    print("Dispatch diagnostics example passed.")


if __name__ == "__main__":
    main()
