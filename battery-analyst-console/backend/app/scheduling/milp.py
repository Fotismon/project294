from math import sqrt

from pydantic import BaseModel, Field

from app.battery.profiles import BatteryOperatingProfile
from app.schemas.schedule import DispatchDiagnostics
from app.scheduling.diagnostics import compute_dispatch_diagnostics

try:
    import pulp
except ImportError:
    pulp = None


DEFAULT_INTERVALS_PER_DAY = 96
DEFAULT_INTERVAL_MINUTES = 15


class MilpDispatchResult(BaseModel):
    feasible: bool
    solver_status: str
    objective_value: float | None = None
    charge_power_mw: list[float]
    discharge_power_mw: list[float]
    net_power_mw: list[float]
    soc_trajectory: list[float]
    energy_trajectory_mwh: list[float]
    diagnostics: DispatchDiagnostics | None = None
    error_message: str | None = None
    explanation: list[str] = Field(default_factory=list)


def solve_milp_dispatch(
    prices: list[float],
    profile: BatteryOperatingProfile,
    temperatures: list[float] | None = None,
    interval_minutes: int = DEFAULT_INTERVAL_MINUTES,
    terminal_soc_tolerance: float = 0.01,
    solver_time_limit_seconds: int | None = 10,
    charge_prices: list[float] | None = None,
    discharge_prices: list[float] | None = None,
) -> MilpDispatchResult:
    input_error = validate_milp_inputs(
        prices=prices,
        profile=profile,
        temperatures=temperatures,
        interval_minutes=interval_minutes,
        terminal_soc_tolerance=terminal_soc_tolerance,
        charge_prices=charge_prices,
        discharge_prices=discharge_prices,
    )
    if input_error is not None:
        return failed_result(
            solver_status="invalid_input",
            error_message=input_error,
            explanation=[input_error],
        )

    if pulp is None:
        message = "PuLP is not installed. Install backend requirements to use MILP."
        return failed_result(
            solver_status="pulp_unavailable",
            error_message=message,
            explanation=[message],
        )

    delta_hours = interval_minutes / 60
    p_max = profile.power_mw
    e_nom = profile.capacity_mwh
    e_min = profile.soc_min * e_nom
    e_max = profile.soc_max * e_nom
    e_0 = profile.initial_soc * e_nom
    e_t_target = profile.target_terminal_soc * e_nom
    eta_ch = sqrt(profile.round_trip_efficiency)
    eta_dis = sqrt(profile.round_trip_efficiency)
    degradation_cost = profile.degradation_cost_eur_per_mwh
    auxiliary_load_mw = getattr(profile, "auxiliary_load_percent", 0.0) * p_max
    grid_connection_limit_mw = profile.grid_connection_limit_mw or p_max
    ramp_limit = profile.ramp_rate_mw_per_interval or p_max
    terminal_tolerance_mwh = terminal_soc_tolerance * e_nom
    intervals = range(DEFAULT_INTERVALS_PER_DAY)
    charge_price_signal = charge_prices if charge_prices is not None else prices
    discharge_price_signal = discharge_prices if discharge_prices is not None else prices

    problem = pulp.LpProblem("bess_dispatch_milp", pulp.LpMaximize)
    p_ch = pulp.LpVariable.dicts("p_ch", intervals, lowBound=0, cat="Continuous")
    p_dis = pulp.LpVariable.dicts("p_dis", intervals, lowBound=0, cat="Continuous")
    energy = pulp.LpVariable.dicts(
        "e",
        intervals,
        lowBound=e_min,
        upBound=e_max,
        cat="Continuous",
    )
    u_ch = pulp.LpVariable.dicts("u_ch", intervals, lowBound=0, upBound=1, cat="Binary")
    u_dis = pulp.LpVariable.dicts("u_dis", intervals, lowBound=0, upBound=1, cat="Binary")

    for index in intervals:
        previous_energy = e_0 if index == 0 else energy[index - 1]
        problem += (
            energy[index]
            == previous_energy
            + eta_ch * p_ch[index] * delta_hours
            - (p_dis[index] / eta_dis) * delta_hours
        ), f"energy_balance_{index}"
        problem += p_ch[index] <= p_max * u_ch[index], f"charge_power_limit_{index}"
        problem += p_dis[index] <= p_max * u_dis[index], f"discharge_power_limit_{index}"
        problem += u_ch[index] + u_dis[index] <= 1, f"mutual_exclusion_{index}"
        problem += p_ch[index] <= grid_connection_limit_mw, f"charge_grid_limit_{index}"
        problem += p_dis[index] <= grid_connection_limit_mw, f"discharge_grid_limit_{index}"

        if index > 0:
            net_now = p_dis[index] - p_ch[index]
            net_previous = p_dis[index - 1] - p_ch[index - 1]
            problem += net_now - net_previous <= ramp_limit, f"ramp_up_{index}"
            problem += net_previous - net_now <= ramp_limit, f"ramp_down_{index}"

    total_discharged_mwh = pulp.lpSum(p_dis[index] * delta_hours for index in intervals)
    problem += (
        total_discharged_mwh <= profile.max_cycles_per_day * e_nom
    ), "cycle_throughput_limit"
    problem += (
        energy[DEFAULT_INTERVALS_PER_DAY - 1] >= e_t_target - terminal_tolerance_mwh
    ), "terminal_soc_lower"
    problem += (
        energy[DEFAULT_INTERVALS_PER_DAY - 1] <= e_t_target + terminal_tolerance_mwh
    ), "terminal_soc_upper"

    objective = pulp.lpSum(
        (
            discharge_price_signal[index] * (p_dis[index] - auxiliary_load_mw * u_dis[index])
            - charge_price_signal[index] * p_ch[index]
            - degradation_cost * p_dis[index]
        )
        * delta_hours
        for index in intervals
    )
    problem += objective

    try:
        solver = pulp.PULP_CBC_CMD(msg=False, timeLimit=solver_time_limit_seconds)
    except TypeError:
        solver = pulp.PULP_CBC_CMD(msg=False)

    problem.solve(solver)
    status = pulp.LpStatus[problem.status]
    objective_value = safe_pulp_value(problem.objective)
    if status != "Optimal":
        return failed_result(
            solver_status=status,
            objective_value=objective_value,
            error_message=f"MILP solver finished with status {status}.",
            explanation=[f"MILP solver status: {status}."],
        )

    charge_power_mw = [round(safe_pulp_value(p_ch[index]) or 0.0, 4) for index in intervals]
    discharge_power_mw = [
        round(safe_pulp_value(p_dis[index]) or 0.0, 4) for index in intervals
    ]
    net_power_mw = [
        round(discharge_power_mw[index] - charge_power_mw[index], 4)
        for index in intervals
    ]
    energy_trajectory_mwh = [round(e_0, 4)] + [
        round(safe_pulp_value(energy[index]) or 0.0, 4) for index in intervals
    ]
    soc_trajectory = [
        round(energy_value / e_nom, 4) for energy_value in energy_trajectory_mwh
    ]
    diagnostics = compute_dispatch_diagnostics(
        charge_power_mw=charge_power_mw,
        discharge_power_mw=discharge_power_mw,
        soc_trajectory=soc_trajectory,
        profile=profile,
        interval_minutes=interval_minutes,
    )
    rounded_objective = round(objective_value, 2) if objective_value is not None else None
    explanation = [
        "MILP solver status: Optimal.",
        f"MILP objective value: {rounded_objective:.2f} EUR."
        if rounded_objective is not None
        else "MILP objective value unavailable.",
        f"Total charged energy: {diagnostics.total_mwh_charged:.2f} MWh.",
        f"Total discharged energy: {diagnostics.total_mwh_discharged:.2f} MWh.",
        f"Equivalent full cycles: {diagnostics.equivalent_full_cycles:.4f}.",
    ]
    if diagnostics.simultaneous_action_violations == 0:
        explanation.append("No simultaneous charge/discharge violations detected.")
    if temperatures is not None:
        explanation.append("Temperature series accepted but not used by MILP v1.")

    return MilpDispatchResult(
        feasible=True,
        solver_status=status,
        objective_value=rounded_objective,
        charge_power_mw=charge_power_mw,
        discharge_power_mw=discharge_power_mw,
        net_power_mw=net_power_mw,
        soc_trajectory=soc_trajectory,
        energy_trajectory_mwh=energy_trajectory_mwh,
        diagnostics=diagnostics,
        explanation=explanation,
    )


def validate_milp_inputs(
    prices: list[float],
    profile: BatteryOperatingProfile,
    temperatures: list[float] | None,
    interval_minutes: int,
    terminal_soc_tolerance: float,
    charge_prices: list[float] | None = None,
    discharge_prices: list[float] | None = None,
) -> str | None:
    if len(prices) != DEFAULT_INTERVALS_PER_DAY:
        return (
            f"prices must contain exactly {DEFAULT_INTERVALS_PER_DAY} values; "
            f"received {len(prices)}."
        )
    if temperatures is not None and len(temperatures) != len(prices):
        return "temperatures must contain the same number of values as prices."
    if charge_prices is not None and len(charge_prices) != len(prices):
        return "charge_prices must contain the same number of values as prices."
    if discharge_prices is not None and len(discharge_prices) != len(prices):
        return "discharge_prices must contain the same number of values as prices."
    if interval_minutes <= 0:
        return "interval_minutes must be positive."
    if terminal_soc_tolerance < 0:
        return "terminal_soc_tolerance must be greater than or equal to 0."
    if profile.power_mw <= 0:
        return "profile.power_mw must be greater than 0."
    if profile.capacity_mwh <= 0:
        return "profile.capacity_mwh must be greater than 0."
    if profile.round_trip_efficiency <= 0 or profile.round_trip_efficiency > 1:
        return "profile.round_trip_efficiency must be greater than 0 and <= 1."
    if not 0 <= profile.soc_min < profile.soc_max <= 1:
        return "profile SoC bounds must satisfy 0 <= soc_min < soc_max <= 1."
    if not profile.soc_min <= profile.initial_soc <= profile.soc_max:
        return "profile.initial_soc must be within SoC bounds."
    if not profile.soc_min <= profile.target_terminal_soc <= profile.soc_max:
        return "profile.target_terminal_soc must be within SoC bounds."
    if profile.max_cycles_per_day <= 0:
        return "profile.max_cycles_per_day must be greater than 0."
    return None


def failed_result(
    solver_status: str,
    error_message: str,
    explanation: list[str],
    objective_value: float | None = None,
) -> MilpDispatchResult:
    zero_dispatch = [0.0] * DEFAULT_INTERVALS_PER_DAY
    return MilpDispatchResult(
        feasible=False,
        solver_status=solver_status,
        objective_value=objective_value,
        charge_power_mw=zero_dispatch,
        discharge_power_mw=zero_dispatch,
        net_power_mw=zero_dispatch,
        soc_trajectory=[0.0] * (DEFAULT_INTERVALS_PER_DAY + 1),
        energy_trajectory_mwh=[0.0] * (DEFAULT_INTERVALS_PER_DAY + 1),
        diagnostics=None,
        error_message=error_message,
        explanation=explanation,
    )


def safe_pulp_value(expression: object) -> float | None:
    value = pulp.value(expression)
    if value is None:
        return None
    return float(value)
