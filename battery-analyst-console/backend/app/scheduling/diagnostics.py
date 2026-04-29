from app.battery.profiles import BatteryOperatingProfile
from app.schemas.schedule import DispatchDiagnostics
from app.scheduling.dispatch import DEFAULT_INTERVAL_MINUTES


def compute_dispatch_diagnostics(
    charge_power_mw: list[float],
    discharge_power_mw: list[float],
    soc_trajectory: list[float],
    profile: BatteryOperatingProfile,
    interval_minutes: int = DEFAULT_INTERVAL_MINUTES,
) -> DispatchDiagnostics:
    if len(charge_power_mw) != len(discharge_power_mw):
        raise ValueError("charge_power_mw and discharge_power_mw must have the same length.")
    if len(soc_trajectory) != len(charge_power_mw) + 1:
        raise ValueError("soc_trajectory must contain one more value than dispatch vectors.")
    if interval_minutes <= 0:
        raise ValueError("interval_minutes must be positive.")

    delta_hours = interval_minutes / 60
    total_mwh_charged = sum(power * delta_hours for power in charge_power_mw)
    total_mwh_discharged = sum(power * delta_hours for power in discharge_power_mw)
    auxiliary_load_mw = getattr(profile, "auxiliary_load_percent", 0.0) * profile.power_mw
    active_discharge_intervals = sum(1 for power in discharge_power_mw if power > 0)
    auxiliary_energy_mwh = auxiliary_load_mw * active_discharge_intervals * delta_hours
    simultaneous_action_violations = sum(
        1
        for charge_power, discharge_power in zip(charge_power_mw, discharge_power_mw)
        if charge_power > 0 and discharge_power > 0
    )
    net_grid_power_mw = [
        discharge_power_mw[index] - charge_power_mw[index]
        for index in range(len(charge_power_mw))
    ]
    max_grid_power_mw = max((abs(power) for power in net_grid_power_mw), default=0.0)
    grid_connection_limit_mw = profile.grid_connection_limit_mw or profile.power_mw
    ramp_limit = profile.ramp_rate_mw_per_interval or profile.power_mw
    ramp_rate_violations = sum(
        1
        for index in range(1, len(net_grid_power_mw))
        if abs(net_grid_power_mw[index] - net_grid_power_mw[index - 1]) > ramp_limit
    )

    return DispatchDiagnostics(
        total_mwh_charged=round(total_mwh_charged, 2),
        total_mwh_discharged=round(total_mwh_discharged, 2),
        equivalent_full_cycles=round(total_mwh_discharged / profile.capacity_mwh, 4),
        auxiliary_load_mw=round(auxiliary_load_mw, 2),
        auxiliary_energy_mwh=round(auxiliary_energy_mwh, 2),
        simultaneous_action_violations=simultaneous_action_violations,
        max_grid_power_mw=round(max_grid_power_mw, 2),
        grid_connection_limit_mw=round(grid_connection_limit_mw, 2),
        grid_connection_limit_ok=max_grid_power_mw <= grid_connection_limit_mw + 1e-9,
        terminal_soc_error=round(abs(soc_trajectory[-1] - profile.target_terminal_soc), 4),
        soc_min_violation_count=sum(1 for soc in soc_trajectory if soc < profile.soc_min),
        soc_max_violation_count=sum(1 for soc in soc_trajectory if soc > profile.soc_max),
        ramp_rate_violations=ramp_rate_violations,
    )


def build_empty_dispatch_diagnostics(
    profile: BatteryOperatingProfile,
) -> DispatchDiagnostics:
    auxiliary_load_mw = getattr(profile, "auxiliary_load_percent", 0.0) * profile.power_mw
    grid_connection_limit_mw = profile.grid_connection_limit_mw or profile.power_mw
    soc_min_violation_count = 1 if profile.initial_soc < profile.soc_min else 0
    soc_max_violation_count = 1 if profile.initial_soc > profile.soc_max else 0

    return DispatchDiagnostics(
        total_mwh_charged=0.0,
        total_mwh_discharged=0.0,
        equivalent_full_cycles=0.0,
        auxiliary_load_mw=round(auxiliary_load_mw, 2),
        auxiliary_energy_mwh=0.0,
        simultaneous_action_violations=0,
        max_grid_power_mw=0.0,
        grid_connection_limit_mw=round(grid_connection_limit_mw, 2),
        grid_connection_limit_ok=True,
        terminal_soc_error=round(abs(profile.initial_soc - profile.target_terminal_soc), 4),
        soc_min_violation_count=soc_min_violation_count,
        soc_max_violation_count=soc_max_violation_count,
        ramp_rate_violations=0,
    )


def build_diagnostics_explanation_lines(
    diagnostics: DispatchDiagnostics,
) -> list[str]:
    lines = [
        f"Equivalent full cycles: {diagnostics.equivalent_full_cycles:.2f}.",
        f"Auxiliary load applied: {diagnostics.auxiliary_load_mw:.2f} MW.",
    ]

    if diagnostics.simultaneous_action_violations > 0:
        lines.append(
            "Simultaneous charge/discharge violations detected: "
            f"{diagnostics.simultaneous_action_violations}."
        )
    else:
        lines.append("No simultaneous charge/discharge violations detected.")

    if diagnostics.grid_connection_limit_ok:
        lines.append("Grid connection limit respected.")
    else:
        lines.append(
            "Grid connection limit exceeded: max "
            f"{diagnostics.max_grid_power_mw:.2f} MW vs limit "
            f"{diagnostics.grid_connection_limit_mw:.2f} MW."
        )

    lines.append(f"Terminal SoC error: {diagnostics.terminal_soc_error:.4f}.")

    if diagnostics.ramp_rate_violations > 0:
        lines.append(
            f"Ramp-rate violations detected: {diagnostics.ramp_rate_violations}."
        )

    soc_violations = (
        diagnostics.soc_min_violation_count + diagnostics.soc_max_violation_count
    )
    if soc_violations > 0:
        lines.append(f"SoC limit violations detected: {soc_violations}.")

    return lines
