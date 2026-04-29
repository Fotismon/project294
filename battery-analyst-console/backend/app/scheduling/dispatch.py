from typing import Literal

from pydantic import BaseModel, Field

from app.battery.profiles import BatteryOperatingProfile
from app.scheduling.profitability import evaluate_discharge_profitability
from app.scheduling.soc import (
    calculate_energy_throughput,
    calculate_equivalent_full_cycles,
    derive_charge_discharge_efficiencies,
    interval_index_to_time,
    time_to_interval_index,
)
from app.scheduling.windows import CandidateWindow


DEFAULT_INTERVALS_PER_DAY = 96
DEFAULT_INTERVAL_MINUTES = 15


class DispatchBlock(BaseModel):
    kind: Literal["charge", "discharge"]
    start: str
    end: str
    start_index: int
    end_index: int
    duration_minutes: int
    avg_price: float
    min_price: float
    max_price: float
    energy_mwh: float


class DispatchPlan(BaseModel):
    charge_power_mw: list[float]
    discharge_power_mw: list[float]
    net_power_mw: list[float]
    soc_trajectory: list[float]
    charge_blocks: list[DispatchBlock]
    discharge_blocks: list[DispatchBlock]
    total_mwh_charged: float
    total_mwh_discharged: float
    equivalent_full_cycles: float


def validate_dispatch_vectors(
    charge_power_mw: list[float],
    discharge_power_mw: list[float],
    expected_intervals: int = DEFAULT_INTERVALS_PER_DAY,
) -> None:
    if len(charge_power_mw) != expected_intervals:
        raise ValueError(
            f"charge_power_mw must contain exactly {expected_intervals} values; "
            f"received {len(charge_power_mw)}."
        )
    if len(discharge_power_mw) != expected_intervals:
        raise ValueError(
            f"discharge_power_mw must contain exactly {expected_intervals} values; "
            f"received {len(discharge_power_mw)}."
        )
    if any(power < 0 for power in charge_power_mw):
        raise ValueError("charge_power_mw values must be greater than or equal to 0.")
    if any(power < 0 for power in discharge_power_mw):
        raise ValueError("discharge_power_mw values must be greater than or equal to 0.")


def extract_dispatch_blocks(
    power_vector_mw: list[float],
    prices: list[float],
    kind: Literal["charge", "discharge"],
    interval_minutes: int = DEFAULT_INTERVAL_MINUTES,
) -> list[DispatchBlock]:
    if len(power_vector_mw) != len(prices):
        raise ValueError("power_vector_mw and prices must have the same length.")
    if interval_minutes <= 0:
        raise ValueError("interval_minutes must be positive.")

    blocks: list[DispatchBlock] = []
    block_start: int | None = None

    for index, power in enumerate(power_vector_mw + [0.0]):
        in_block = block_start is not None
        if power > 0 and not in_block:
            block_start = index
            continue

        if (power <= 0 or index == len(power_vector_mw)) and in_block:
            start_index = block_start
            end_index = index
            block_power = power_vector_mw[start_index:end_index]
            block_prices = prices[start_index:end_index]
            interval_hours = interval_minutes / 60
            energy_mwh = sum(value * interval_hours for value in block_power)

            blocks.append(
                DispatchBlock(
                    kind=kind,
                    start=interval_index_to_time(start_index, interval_minutes),
                    end=interval_index_to_time(end_index, interval_minutes),
                    start_index=start_index,
                    end_index=end_index,
                    duration_minutes=(end_index - start_index) * interval_minutes,
                    avg_price=round(sum(block_prices) / len(block_prices), 2),
                    min_price=round(min(block_prices), 2),
                    max_price=round(max(block_prices), 2),
                    energy_mwh=round(energy_mwh, 2),
                )
            )
            block_start = None

    return blocks


def select_primary_charge_window(
    charge_blocks: list[DispatchBlock],
) -> DispatchBlock | None:
    if not charge_blocks:
        return None

    return sorted(
        charge_blocks,
        key=lambda block: (block.avg_price, -block.energy_mwh, block.start_index),
    )[0]


def select_primary_discharge_window(
    discharge_blocks: list[DispatchBlock],
) -> DispatchBlock | None:
    if not discharge_blocks:
        return None

    return sorted(
        discharge_blocks,
        key=lambda block: (-block.avg_price, -block.energy_mwh, block.start_index),
    )[0]


def dispatch_block_to_window(block: DispatchBlock | None) -> dict[str, str | float]:
    if block is None:
        return {"start": "00:00", "end": "00:00", "avg_price": 0.0}

    return {
        "start": block.start,
        "end": block.end,
        "avg_price": block.avg_price,
    }


def build_dispatch_plan_from_windows(
    charge_windows: list[CandidateWindow],
    discharge_windows: list[CandidateWindow],
    prices: list[float],
    profile: BatteryOperatingProfile,
    interval_minutes: int = DEFAULT_INTERVAL_MINUTES,
) -> DispatchPlan:
    if len(prices) != DEFAULT_INTERVALS_PER_DAY:
        raise ValueError(
            f"prices must contain exactly {DEFAULT_INTERVALS_PER_DAY} values; "
            f"received {len(prices)}."
        )
    if profile.power_mw <= 0:
        raise ValueError("profile.power_mw must be greater than 0.")
    if profile.capacity_mwh <= 0:
        raise ValueError("profile.capacity_mwh must be greater than 0.")

    charge_power_mw = [0.0] * DEFAULT_INTERVALS_PER_DAY
    discharge_power_mw = [0.0] * DEFAULT_INTERVALS_PER_DAY

    for window in charge_windows:
        start_index = time_to_interval_index(window.start, interval_minutes)
        end_index = time_to_interval_index(window.end, interval_minutes)
        for index in range(start_index, end_index):
            if discharge_power_mw[index] > 0:
                raise ValueError("charge and discharge windows must not overlap.")
            charge_power_mw[index] = profile.power_mw

    for window in discharge_windows:
        start_index = time_to_interval_index(window.start, interval_minutes)
        end_index = time_to_interval_index(window.end, interval_minutes)
        for index in range(start_index, end_index):
            if charge_power_mw[index] > 0:
                raise ValueError("charge and discharge windows must not overlap.")
            discharge_power_mw[index] = profile.power_mw

    validate_dispatch_vectors(charge_power_mw, discharge_power_mw)
    net_power_mw = [
        round(discharge_power_mw[index] - charge_power_mw[index], 4)
        for index in range(DEFAULT_INTERVALS_PER_DAY)
    ]
    charge_efficiency, discharge_efficiency = derive_charge_discharge_efficiencies(
        profile.round_trip_efficiency
    )

    delta_hours = interval_minutes / 60
    soc = profile.initial_soc
    soc_trajectory = [round(soc, 4)]
    for index in range(DEFAULT_INTERVALS_PER_DAY):
        soc = soc + (
            charge_power_mw[index] * charge_efficiency
            - discharge_power_mw[index] / discharge_efficiency
        ) * delta_hours / profile.capacity_mwh
        soc_trajectory.append(round(soc, 4))

    total_mwh_charged, total_mwh_discharged = calculate_energy_throughput(
        charge_power_mw=charge_power_mw,
        discharge_power_mw=discharge_power_mw,
        interval_minutes=interval_minutes,
    )
    equivalent_full_cycles = calculate_equivalent_full_cycles(
        total_mwh_discharged=total_mwh_discharged,
        capacity_mwh=profile.capacity_mwh,
    )

    return DispatchPlan(
        charge_power_mw=charge_power_mw,
        discharge_power_mw=discharge_power_mw,
        net_power_mw=net_power_mw,
        soc_trajectory=soc_trajectory,
        charge_blocks=extract_dispatch_blocks(
            charge_power_mw,
            prices,
            kind="charge",
            interval_minutes=interval_minutes,
        ),
        discharge_blocks=extract_dispatch_blocks(
            discharge_power_mw,
            prices,
            kind="discharge",
            interval_minutes=interval_minutes,
        ),
        total_mwh_charged=total_mwh_charged,
        total_mwh_discharged=total_mwh_discharged,
        equivalent_full_cycles=equivalent_full_cycles,
    )


def select_profitable_dispatch_windows(
    windows: list[CandidateWindow],
    profile: BatteryOperatingProfile,
    max_charge_blocks: int = 1,
    max_discharge_blocks: int = 2,
) -> tuple[list[CandidateWindow], list[CandidateWindow], list[str]]:
    if not windows:
        return [], [], ["No candidate windows were available for V1.2 dispatch selection."]
    if max_charge_blocks < 1:
        raise ValueError("max_charge_blocks must be at least 1.")
    if max_discharge_blocks < 1:
        raise ValueError("max_discharge_blocks must be at least 1.")

    charge_windows = sorted(
        windows,
        key=lambda window: (
            window.avg_price,
            window.duration_minutes,
            time_to_interval_index(window.start),
        ),
    )[:max_charge_blocks]
    if not charge_windows:
        return [], [], ["No charge window was selected for V1.2 dispatch selection."]

    primary_charge = charge_windows[0]
    charge_end_index = time_to_interval_index(primary_charge.end)
    selected_discharge_windows: list[CandidateWindow] = []

    for discharge_window in sorted(
        windows,
        key=lambda window: (
            -window.avg_price,
            window.duration_minutes,
            time_to_interval_index(window.start),
        ),
    ):
        if len(selected_discharge_windows) >= max_discharge_blocks:
            break

        if time_to_interval_index(discharge_window.start) < charge_end_index:
            continue

        if any(windows_overlap(discharge_window, selected) for selected in selected_discharge_windows):
            continue

        profitability = evaluate_discharge_profitability(
            charge_price=primary_charge.avg_price,
            discharge_price=discharge_window.avg_price,
            round_trip_efficiency=profile.round_trip_efficiency,
            degradation_cost_eur_per_mwh=profile.degradation_cost_eur_per_mwh,
        )
        if not profitability.profitable:
            continue

        trial_discharge_windows = selected_discharge_windows + [discharge_window]
        trial_plan = build_dispatch_plan_from_windows(
            charge_windows=charge_windows,
            discharge_windows=trial_discharge_windows,
            prices=[0.0] * DEFAULT_INTERVALS_PER_DAY,
            profile=profile,
        )
        if min(trial_plan.soc_trajectory) < profile.soc_min:
            continue
        if max(trial_plan.soc_trajectory) > profile.soc_max:
            continue

        selected_discharge_windows.append(discharge_window)

    if selected_discharge_windows:
        selected_discharge_windows = sorted(
            selected_discharge_windows,
            key=lambda window: time_to_interval_index(window.start),
        )
        explanation = [
            (
                "Window scheduler V1.2 selected "
                f"{len(charge_windows)} {pluralize('charge block', len(charge_windows))} "
                "and "
                f"{len(selected_discharge_windows)} "
                f"{pluralize('discharge block', len(selected_discharge_windows))}."
            )
        ]
        for index, discharge_window in enumerate(selected_discharge_windows, start=1):
            profitability = evaluate_discharge_profitability(
                charge_price=primary_charge.avg_price,
                discharge_price=discharge_window.avg_price,
                round_trip_efficiency=profile.round_trip_efficiency,
                degradation_cost_eur_per_mwh=profile.degradation_cost_eur_per_mwh,
            )
            explanation.append(
                (
                    f"Selected discharge block {index} clears hurdle by "
                    f"{profitability.net_profit_eur_per_mwh:.2f} €/MWh."
                )
            )
        explanation.append(
            (
                "Primary response windows show the lowest-price charge block and "
                "highest-price discharge block for frontend compatibility."
            )
        )
    else:
        explanation = []
        explanation.append("No profitable multi-dispatch plan cleared the hurdle-cost check.")

    return charge_windows, selected_discharge_windows, explanation


def windows_overlap(first: CandidateWindow, second: CandidateWindow) -> bool:
    first_start = time_to_interval_index(first.start)
    first_end = time_to_interval_index(first.end)
    second_start = time_to_interval_index(second.start)
    second_end = time_to_interval_index(second.end)
    return first_start < second_end and second_start < first_end


def pluralize(label: str, count: int) -> str:
    if count == 1:
        return label
    return f"{label}s"
