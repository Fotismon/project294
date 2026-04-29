from app.battery.profiles import get_battery_profile
from app.data.market_prices import get_price_history_before_date, get_prices_for_date
from app.schemas.backtest import (
    BacktestEconomicResult,
    BacktestRealizedWindow,
    BacktestRequest,
    BacktestResponse,
)
from app.schemas.schedule import ScheduleRequest
from app.scheduling.schedule_runner import run_schedule_analysis
from app.scheduling.soc import time_to_interval_index


FALLBACK_FORECAST_WARNING = (
    "No prior historical data was available; used same-day actual prices as fallback "
    "forecast for MVP testing."
)


def generate_backtest_forecast(
    date: str,
    lookback_days: int = 7,
    forecast_method: str = "lookback_average",
) -> tuple[list[float], list[str]]:
    """Generate a lightweight backtest forecast from prior local price history."""

    if forecast_method != "lookback_average":
        raise ValueError(f"Unknown forecast_method '{forecast_method}'.")

    histories = get_price_history_before_date(date, lookback_days)
    if histories:
        forecast_prices = [
            round(sum(day_prices[index] for day_prices in histories) / len(histories), 2)
            for index in range(96)
        ]
        return forecast_prices, [
            f"Generated lookback-average forecast from {len(histories)} prior day(s)."
        ]

    actual_prices, _temperatures = get_prices_for_date(date)
    return actual_prices, [FALLBACK_FORECAST_WARNING]


def average_prices_for_window(prices: list[float], start: str, end: str) -> float:
    """Average 96-interval prices over an HH:MM window."""

    if len(prices) != 96:
        raise ValueError(f"Expected 96 prices; received {len(prices)}.")

    start_index = time_to_interval_index(start)
    end_index = time_to_interval_index(end)
    if start_index >= end_index:
        raise ValueError("Window end must be after window start.")

    return round(sum(prices[start_index:end_index]) / (end_index - start_index), 2)


def run_lightweight_backtest(request: BacktestRequest) -> BacktestResponse:
    """Run a lightweight historical backtest for a single date."""

    actual_prices, actual_temperatures = get_prices_for_date(request.date)
    forecast_prices, forecast_explanation = generate_backtest_forecast(
        date=request.date,
        lookback_days=request.lookback_days,
        forecast_method=request.forecast_method,
    )
    warnings = [
        line for line in forecast_explanation if line == FALLBACK_FORECAST_WARNING
    ]

    schedule_request = ScheduleRequest(
        date=request.date,
        profile_name=request.profile_name,
        prices=forecast_prices,
        temperatures=actual_temperatures,
        market_volatility=request.market_volatility,
        data_quality_level=request.data_quality_level,
        minimum_margin_eur_per_mwh=request.minimum_margin_eur_per_mwh,
    )
    schedule_response = run_schedule_analysis(schedule_request)

    if schedule_response.decision == "hold":
        return BacktestResponse(
            date=request.date,
            profile_name=request.profile_name,
            forecast_method=request.forecast_method,
            decision="hold",
            confidence=schedule_response.confidence,
            charge_window=None,
            discharge_window=None,
            economic_result=None,
            schedule_response=schedule_response,
            explanation=forecast_explanation
            + ["Scheduler returned hold, so no realized trade value was calculated."],
            warnings=warnings,
        )

    profile = get_battery_profile(request.profile_name)
    charge_window = schedule_response.charge_window
    discharge_window = schedule_response.discharge_window
    realized_charge_avg = average_prices_for_window(
        actual_prices,
        charge_window.start,
        charge_window.end,
    )
    realized_discharge_avg = average_prices_for_window(
        actual_prices,
        discharge_window.start,
        discharge_window.end,
    )
    adjusted_realized_charge_price = realized_charge_avg / profile.round_trip_efficiency
    realized_spread_after_efficiency = (
        realized_discharge_avg - adjusted_realized_charge_price
    )
    realized_net_spread = (
        realized_spread_after_efficiency
        - profile.degradation_cost_eur_per_mwh
        - request.minimum_margin_eur_per_mwh
    )
    discharge_hours = (
        time_to_interval_index(discharge_window.end)
        - time_to_interval_index(discharge_window.start)
    ) * 0.25
    discharged_mwh = discharge_hours * profile.power_mw
    realized_value_eur = realized_net_spread * discharged_mwh
    forecast_midpoint = sum(schedule_response.expected_value_range_eur) / 2
    value_error_eur = realized_value_eur - forecast_midpoint

    return BacktestResponse(
        date=request.date,
        profile_name=request.profile_name,
        forecast_method=request.forecast_method,
        decision=schedule_response.decision,
        confidence=schedule_response.confidence,
        charge_window=BacktestRealizedWindow(
            start=charge_window.start,
            end=charge_window.end,
            forecast_avg_price=charge_window.avg_price,
            realized_avg_price=realized_charge_avg,
        ),
        discharge_window=BacktestRealizedWindow(
            start=discharge_window.start,
            end=discharge_window.end,
            forecast_avg_price=discharge_window.avg_price,
            realized_avg_price=realized_discharge_avg,
        ),
        economic_result=BacktestEconomicResult(
            forecast_spread_after_efficiency=schedule_response.spread_after_efficiency,
            realized_spread_after_efficiency=round(realized_spread_after_efficiency, 2),
            forecast_expected_value_range_eur=schedule_response.expected_value_range_eur,
            realized_value_eur=round(realized_value_eur, 2),
            value_error_eur=round(value_error_eur, 2),
        ),
        schedule_response=schedule_response,
        explanation=forecast_explanation
        + [
            "Compared recommended forecast windows against actual realized prices.",
            "Realized value uses a simplified spread and discharged-MWh estimate.",
        ],
        warnings=warnings,
    )
