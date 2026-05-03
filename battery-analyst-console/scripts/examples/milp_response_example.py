import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from app.battery.profiles import get_battery_profile
from app.scheduling.milp import solve_milp_dispatch
from app.scheduling.milp_response import convert_milp_result_to_schedule_response


def main() -> None:
    profile = get_battery_profile("greece_100mw_300mwh")
    prices = [60.0] * 96
    prices[44:56] = [30.0] * 12
    prices[72:80] = [80.0] * 8
    prices[84:88] = [120.0] * 4

    result = solve_milp_dispatch(prices=prices, profile=profile)
    if not result.feasible:
        print(f"MILP solve failed: {result.solver_status}")
        if result.error_message:
            print(result.error_message)
        raise SystemExit(1)

    response = convert_milp_result_to_schedule_response(
        result=result,
        prices=prices,
        profile=profile,
        date="2026-04-29",
    )

    assert response.optimizer.used_mode == "milp"
    assert response.optimizer.model_version == "milp_v1"
    assert response.diagnostics is not None
    assert response.charge_window.start != response.charge_window.end
    assert response.discharge_window.start != response.discharge_window.end
    assert response.explanation

    print(f"decision: {response.decision}")
    print(f"confidence: {response.confidence}")
    print(f"optimizer.used_mode: {response.optimizer.used_mode}")
    print(f"optimizer.solver_status: {response.optimizer.solver_status}")
    print(f"charge_window: {response.charge_window.model_dump()}")
    print(f"discharge_window: {response.discharge_window.model_dump()}")
    print(f"expected_value_range_eur: {response.expected_value_range_eur}")
    print(f"diagnostics.equivalent_full_cycles: {response.diagnostics.equivalent_full_cycles:.4f}")
    print("explanation:")
    for line in response.explanation[:6]:
        print(f"- {line}")
    print("MILP response conversion example passed.")


if __name__ == "__main__":
    main()
