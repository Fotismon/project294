from app.battery.profiles import BatteryOperatingProfile
from app.fleet.config import FleetAssetConfig, list_fleet_assets
from app.schemas.schedule import (
    FleetEconomics,
    ForecastProvenance,
    PriceSpreadDiagnostics,
    PriceSpreadSummary,
    Window,
)


def build_forecast_provenance() -> ForecastProvenance:
    return ForecastProvenance(
        source="open_meteo_weather_plus_lightgbm_price_forecast",
        weather_source="Open-Meteo",
        weather_api_role="Weather features only; not direct price data.",
        price_model="LightGBM DAM price forecast",
        price_output="Predicted day-ahead market price forecast",
        price_unit="EUR/MWh",
    )


def build_fleet_economics(
    single_profile_expected_value_range_eur: list[float],
    profile: BatteryOperatingProfile,
    assets: list[FleetAssetConfig] | None = None,
) -> FleetEconomics:
    configured_assets = assets if assets is not None else list_fleet_assets()
    active_assets = [asset for asset in configured_assets if asset.status != "offline"]
    total_power_mw = round(sum(asset.power_mw for asset in active_assets), 2)
    total_capacity_mwh = round(sum(asset.capacity_mwh for asset in active_assets), 2)
    scaling_factor = total_power_mw / profile.power_mw if profile.power_mw > 0 else 0.0
    single_range = _normalize_value_range(single_profile_expected_value_range_eur)
    fleet_range = [round(value * scaling_factor, 2) for value in single_range]

    return FleetEconomics(
        single_profile_expected_value_range_eur=single_range,
        fleet_expected_value_range_eur=fleet_range,
        active_battery_count=len(active_assets),
        total_fleet_power_mw=total_power_mw,
        total_fleet_capacity_mwh=total_capacity_mwh,
        scaling_factor=round(scaling_factor, 4),
        scaling_basis=(
            "Configured active fleet power divided by scheduled profile power."
        ),
        price_unit="EUR/MWh",
        energy_unit="MWh",
        value_formula="net_spread_eur_per_mwh * discharged_mwh",
    )


def build_price_spread_diagnostics(
    prices: list[float],
    charge_window: Window,
    discharge_window: Window,
    profile: BatteryOperatingProfile,
    reference_prices: list[float] | None = None,
) -> PriceSpreadDiagnostics:
    if reference_prices and len(reference_prices) == 96:
        ref_charge_window, ref_discharge_window = _derive_reference_windows(reference_prices)
        ref_prices = reference_prices
    else:
        ref_prices = old_mock_reference_prices()
        ref_charge_window = Window(start="11:00", end="13:00", avg_price=35.0)
        ref_discharge_window = Window(start="20:00", end="22:00", avg_price=120.0)

    return PriceSpreadDiagnostics(
        mock_reference=price_spread_summary(
            prices=ref_prices,
            charge_window=ref_charge_window,
            discharge_window=ref_discharge_window,
            profile=profile,
        ),
        live_forecast=price_spread_summary(
            prices=prices,
            charge_window=charge_window,
            discharge_window=discharge_window,
            profile=profile,
        ),
        value_math="EUR = EUR/MWh * MWh",
    )


def _derive_reference_windows(prices: list[float]) -> tuple[Window, Window]:
    """Find the cheapest and most expensive 8-interval (2-hour) windows in a price series."""
    n = len(prices)
    window_size = 8
    best_charge_idx = min(range(n - window_size + 1), key=lambda i: sum(prices[i:i + window_size]) / window_size)
    best_discharge_idx = max(range(n - window_size + 1), key=lambda i: sum(prices[i:i + window_size]) / window_size)

    def idx_to_time(idx: int) -> str:
        total_minutes = idx * 15
        return f"{total_minutes // 60:02d}:{total_minutes % 60:02d}"

    charge_avg = round(sum(prices[best_charge_idx:best_charge_idx + window_size]) / window_size, 2)
    discharge_avg = round(sum(prices[best_discharge_idx:best_discharge_idx + window_size]) / window_size, 2)

    charge_window = Window(
        start=idx_to_time(best_charge_idx),
        end=idx_to_time(best_charge_idx + window_size),
        avg_price=charge_avg,
    )
    discharge_window = Window(
        start=idx_to_time(best_discharge_idx),
        end=idx_to_time(best_discharge_idx + window_size),
        avg_price=discharge_avg,
    )
    return charge_window, discharge_window


def old_mock_reference_prices() -> list[float]:
    prices = [80.0] * 96
    prices[44:52] = [35.0] * 8
    prices[80:88] = [120.0] * 8
    return prices


def price_spread_summary(
    prices: list[float],
    charge_window: Window,
    discharge_window: Window,
    profile: BatteryOperatingProfile,
) -> PriceSpreadSummary:
    charge_avg = charge_window.avg_price
    discharge_avg = discharge_window.avg_price
    raw_spread = discharge_avg - charge_avg
    spread_after_efficiency = (
        discharge_avg - (charge_avg / profile.round_trip_efficiency)
        if profile.round_trip_efficiency > 0
        else 0.0
    )

    return PriceSpreadSummary(
        min_price_eur_per_mwh=round(min(prices), 2) if prices else 0.0,
        max_price_eur_per_mwh=round(max(prices), 2) if prices else 0.0,
        raw_spread_eur_per_mwh=round(raw_spread, 2),
        charge_avg_price_eur_per_mwh=round(charge_avg, 2),
        discharge_avg_price_eur_per_mwh=round(discharge_avg, 2),
        spread_after_efficiency_eur_per_mwh=round(spread_after_efficiency, 2),
    )


def _normalize_value_range(values: list[float]) -> list[float]:
    if not values:
        return [0.0, 0.0]
    if len(values) == 1:
        value = round(values[0], 2)
        return [value, value]
    return [round(values[0], 2), round(values[1], 2)]

