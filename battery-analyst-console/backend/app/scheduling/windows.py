from pydantic import BaseModel, Field


DEFAULT_INTERVALS_PER_DAY = 96
DEFAULT_INTERVAL_MINUTES = 15
DEFAULT_WINDOW_DURATIONS_MINUTES = [60, 120, 180, 240]


class CandidateWindow(BaseModel):
    """Candidate rolling window with simple price and temperature statistics."""

    start: str = Field(..., description="Window start time in HH:MM format.")
    end: str = Field(..., description="Window end time in HH:MM format.")
    duration_minutes: int = Field(..., description="Window duration in minutes.")
    avg_price: float = Field(..., description="Average price inside the window.")
    min_price: float = Field(..., description="Minimum price inside the window.")
    max_price: float = Field(..., description="Maximum price inside the window.")
    temperature_avg: float | None = Field(
        None,
        description="Average temperature inside the window, if provided.",
    )


def format_interval_time(
    interval_index: int,
    interval_minutes: int = DEFAULT_INTERVAL_MINUTES,
) -> str:
    """Convert an interval index into zero-padded HH:MM time."""

    if interval_index < 0:
        raise ValueError("interval_index must be non-negative.")

    if interval_minutes <= 0:
        raise ValueError("interval_minutes must be positive.")

    total_minutes = interval_index * interval_minutes
    hours = total_minutes // 60
    minutes = total_minutes % 60
    return f"{hours:02d}:{minutes:02d}"


def validate_forecast_series(
    prices: list[float],
    temperatures: list[float] | None = None,
    expected_intervals: int = DEFAULT_INTERVALS_PER_DAY,
) -> None:
    """Validate price and optional temperature series lengths."""

    if not prices:
        raise ValueError("prices must not be empty.")

    if len(prices) != expected_intervals:
        raise ValueError(
            f"prices must contain exactly {expected_intervals} values; "
            f"received {len(prices)}."
        )

    if temperatures is not None and len(temperatures) != len(prices):
        raise ValueError(
            "temperatures must contain the same number of values as prices; "
            f"received {len(temperatures)} temperatures and {len(prices)} prices."
        )


def generate_rolling_windows(
    prices: list[float],
    temperatures: list[float] | None = None,
    interval_minutes: int = DEFAULT_INTERVAL_MINUTES,
    window_durations_minutes: list[int] | None = None,
) -> list[CandidateWindow]:
    """Generate rolling candidate windows over a 96-interval forecast day.

    Example:
        prices = [50.0] * 96
        windows = generate_rolling_windows(prices)
        len(windows)  # 348
    """

    validate_forecast_series(prices=prices, temperatures=temperatures)

    durations = window_durations_minutes or DEFAULT_WINDOW_DURATIONS_MINUTES
    windows: list[CandidateWindow] = []

    for duration_minutes in durations:
        if duration_minutes <= 0:
            raise ValueError("window durations must be positive.")

        if duration_minutes % interval_minutes != 0:
            raise ValueError("window durations must be divisible by interval_minutes.")

        interval_count = duration_minutes // interval_minutes
        if interval_count > len(prices):
            raise ValueError("window duration cannot exceed the forecast series length.")

        for start_index in range(0, len(prices) - interval_count + 1):
            end_index = start_index + interval_count
            price_window = prices[start_index:end_index]
            temperature_window = (
                temperatures[start_index:end_index] if temperatures is not None else None
            )

            temperature_avg = None
            if temperature_window is not None:
                temperature_avg = round(sum(temperature_window) / len(temperature_window), 2)

            windows.append(
                CandidateWindow(
                    start=format_interval_time(start_index, interval_minutes),
                    end=format_interval_time(end_index, interval_minutes),
                    duration_minutes=duration_minutes,
                    avg_price=round(sum(price_window) / len(price_window), 2),
                    min_price=round(min(price_window), 2),
                    max_price=round(max(price_window), 2),
                    temperature_avg=temperature_avg,
                )
            )

    return windows
