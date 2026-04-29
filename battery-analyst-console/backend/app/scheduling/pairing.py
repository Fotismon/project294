from pydantic import BaseModel, Field

from app.scheduling.windows import CandidateWindow


class CandidateSchedule(BaseModel):
    """Candidate charge/discharge schedule pair with raw spread statistics."""

    charge_window: CandidateWindow = Field(..., description="Candidate charging window.")
    discharge_window: CandidateWindow = Field(..., description="Candidate discharging window.")
    charge_avg_price: float = Field(..., description="Average charge window price.")
    discharge_avg_price: float = Field(..., description="Average discharge window price.")
    raw_spread: float = Field(
        ...,
        description="Discharge average price minus charge average price.",
    )
    rest_minutes: int = Field(
        ...,
        description="Minutes between charge window end and discharge window start.",
    )


def time_to_minutes(time_str: str) -> int:
    """Convert an HH:MM time string into minutes after midnight."""

    parts = time_str.split(":")
    if len(parts) != 2:
        raise ValueError(f"Invalid time format '{time_str}'. Expected HH:MM.")

    hour_str, minute_str = parts
    if not hour_str.isdigit() or not minute_str.isdigit():
        raise ValueError(f"Invalid time format '{time_str}'. Expected numeric HH:MM.")

    hour = int(hour_str)
    minute = int(minute_str)

    if hour < 0 or hour > 24:
        raise ValueError("hour must be between 0 and 24.")

    if minute < 0 or minute > 59:
        raise ValueError("minute must be between 0 and 59.")

    if hour == 24 and minute != 0:
        raise ValueError("24:00 is the only valid time in hour 24.")

    return hour * 60 + minute


def calculate_rest_minutes(
    charge_window: CandidateWindow,
    discharge_window: CandidateWindow,
) -> int:
    """Calculate minutes between charge window end and discharge window start."""

    return time_to_minutes(discharge_window.start) - time_to_minutes(charge_window.end)


def is_valid_charge_discharge_pair(
    charge_window: CandidateWindow,
    discharge_window: CandidateWindow,
    min_rest_between_actions_minutes: int,
) -> bool:
    """Return whether charge and discharge windows form a valid ordered pair."""

    charge_start = time_to_minutes(charge_window.start)
    charge_end = time_to_minutes(charge_window.end)
    discharge_start = time_to_minutes(discharge_window.start)

    if charge_start >= discharge_start:
        return False

    if charge_end > discharge_start:
        return False

    rest_minutes = calculate_rest_minutes(charge_window, discharge_window)
    return rest_minutes >= min_rest_between_actions_minutes


def pair_charge_discharge_windows(
    charge_windows: list[CandidateWindow],
    discharge_windows: list[CandidateWindow],
    min_rest_between_actions_minutes: int = 60,
    min_raw_spread: float | None = None,
    max_pairs: int | None = None,
) -> list[CandidateSchedule]:
    """Create ranked candidate schedules from charge and discharge windows.

    Example:
        from app.scheduling.windows import generate_rolling_windows
        from app.scheduling.pairing import pair_charge_discharge_windows

        prices = [80.0] * 96
        prices[44:52] = [35.0] * 8
        prices[80:88] = [120.0] * 8

        windows = generate_rolling_windows(prices)
        pairs = pair_charge_discharge_windows(
            charge_windows=windows,
            discharge_windows=windows,
            min_rest_between_actions_minutes=60,
            max_pairs=5,
        )
    """

    candidate_schedules: list[CandidateSchedule] = []

    for charge_window in charge_windows:
        for discharge_window in discharge_windows:
            if not is_valid_charge_discharge_pair(
                charge_window=charge_window,
                discharge_window=discharge_window,
                min_rest_between_actions_minutes=min_rest_between_actions_minutes,
            ):
                continue

            charge_avg_price = charge_window.avg_price
            discharge_avg_price = discharge_window.avg_price
            raw_spread = round(discharge_avg_price - charge_avg_price, 2)

            if min_raw_spread is not None and raw_spread < min_raw_spread:
                continue

            candidate_schedules.append(
                CandidateSchedule(
                    charge_window=charge_window,
                    discharge_window=discharge_window,
                    charge_avg_price=charge_avg_price,
                    discharge_avg_price=discharge_avg_price,
                    raw_spread=raw_spread,
                    rest_minutes=calculate_rest_minutes(charge_window, discharge_window),
                )
            )

    candidate_schedules.sort(
        key=lambda schedule: (
            -schedule.raw_spread,
            schedule.charge_avg_price,
            -schedule.discharge_avg_price,
        )
    )

    if max_pairs is not None:
        return candidate_schedules[:max_pairs]

    return candidate_schedules
