from app.battery.profiles import get_battery_profile
from app.data.market_prices import get_prices_for_date
from app.forecasting.forecast_data import (
    build_inference_features,
    fetch_weather_forecast,
    load_feature_store,
)
from app.forecasting.forecast_engine import run_forecast
from app.schemas.backtest import (
    BacktestCurvePoint,
    BacktestEconomicResult,
    BacktestRealizedWindow,
    BacktestRequest,
    BacktestResponse,
)
from app.schemas.schedule import ScheduleRequest
from app.scheduling.schedule_runner import run_schedule_analysis
from app.scheduling.soc import time_to_interval_index


def generate_backtest_forecast(
    date: str,
    **_kwargs,
) -> tuple[list[float], float, list[str], list]:
    """Generate a D+1 forecast using the trained LightGBM quantile models."""
    store = load_feature_store()
    try:
        weather = fetch_weather_forecast(date)
    except Exception:
        import pandas as pd
        weather = pd.DataFrame()

    X = build_inference_features(date, store, weather)
    forecast_response = run_forecast(date, X)

    prices = [pt.predicted_price for pt in forecast_response.points]
    avg_band_width = forecast_response.avg_band_width_eur
    return (
        prices,
        avg_band_width,
        [
            "Generated day-ahead LightGBM quantile forecast for historical replay.",
            f"Average P05-P95 band: {avg_band_width:.1f} EUR/MWh.",
            "Realized comparison uses historical HENEX MCP, not direct day-ahead API prices.",
        ],
        forecast_response.points,
    )


def build_backtest_curve(
    forecast_points: list,
    realized_prices: list[float],
) -> list[BacktestCurvePoint]:
    return [
        BacktestCurvePoint(
            timestamp=point.timestamp,
            forecast_price=point.predicted_price,
            realized_price=round(realized_prices[index], 2),
            lower_bound=point.lower_bound,
            upper_bound=point.upper_bound,
        )
        for index, point in enumerate(forecast_points[: len(realized_prices)])
    ]


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
    """Run a historical backtest for a single date using the LightGBM forecast model."""

    actual_prices, actual_temperatures = get_prices_for_date(request.date)
    forecast_prices, avg_band_width, forecast_explanation, forecast_points = generate_backtest_forecast(
        date=request.date,
    )
    forecast_method = "day_ahead_lightgbm"
    curve = build_backtest_curve(forecast_points, actual_prices)
    warnings: list[str] = []

    schedule_request = ScheduleRequest(
        date=request.date,
        profile_name=request.profile_name,
        optimizer_mode=request.optimizer_mode,
        prices=forecast_prices,
        temperatures=actual_temperatures,
        forecast_uncertainty_width=avg_band_width,
        market_volatility=request.market_volatility,
        data_quality_level=request.data_quality_level,
        minimum_margin_eur_per_mwh=request.minimum_margin_eur_per_mwh,
    )
    schedule_response = run_schedule_analysis(schedule_request)

    if schedule_response.decision == "hold":
        return BacktestResponse(
            date=request.date,
            profile_name=request.profile_name,
            forecast_method=forecast_method,
            decision="hold",
            confidence=schedule_response.confidence,
            charge_window=None,
            discharge_window=None,
            economic_result=None,
            schedule_response=schedule_response,
            curve=curve,
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
        forecast_method=forecast_method,
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
        curve=curve,
        explanation=forecast_explanation
        + [
            "Compared recommended forecast windows against actual realized prices.",
            "Realized value uses a simplified spread and discharged-MWh estimate.",
        ],
        warnings=warnings,
    )
