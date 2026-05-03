import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from app.battery.profiles import get_battery_profile
from app.fleet.config import FleetAssetConfig
from app.schemas.schedule import Window
from app.scheduling.value_diagnostics import (
    build_fleet_economics,
    build_forecast_provenance,
    build_price_spread_diagnostics,
    old_mock_reference_prices,
)


def main() -> None:
    profile = get_battery_profile("greece_100mw_300mwh")
    single_value_range = [1000.0, 1200.0]
    fleet = build_fleet_economics(single_value_range, profile)
    assert fleet.active_battery_count == 10
    assert fleet.total_fleet_power_mw == 1000.0
    assert fleet.total_fleet_capacity_mwh == 3000.0
    assert fleet.scaling_factor == 10.0
    assert fleet.fleet_expected_value_range_eur == [10000.0, 12000.0]

    one_asset = [
        FleetAssetConfig(
            id="one",
            name="One battery",
            site="test",
            status="available",
            profile_name="greece_100mw_300mwh",
            power_mw=100,
            capacity_mwh=300,
        )
    ]
    one_asset_fleet = build_fleet_economics(single_value_range, profile, assets=one_asset)
    assert one_asset_fleet.scaling_factor == 1.0
    assert one_asset_fleet.fleet_expected_value_range_eur == single_value_range

    mixed_assets = one_asset + [
        FleetAssetConfig(
            id="two",
            name="Two battery",
            site="test",
            status="available",
            profile_name="greece_100mw_300mwh",
            power_mw=50,
            capacity_mwh=150,
        ),
        FleetAssetConfig(
            id="offline",
            name="Offline battery",
            site="test",
            status="offline",
            profile_name="greece_100mw_300mwh",
            power_mw=100,
            capacity_mwh=300,
        ),
    ]
    mixed_fleet = build_fleet_economics(single_value_range, profile, assets=mixed_assets)
    assert mixed_fleet.active_battery_count == 2
    assert mixed_fleet.total_fleet_power_mw == 150.0
    assert mixed_fleet.scaling_factor == 1.5
    assert mixed_fleet.fleet_expected_value_range_eur == [1500.0, 1800.0]

    diagnostics = build_price_spread_diagnostics(
        prices=old_mock_reference_prices(),
        charge_window=Window(start="11:00", end="13:00", avg_price=35.0),
        discharge_window=Window(start="20:00", end="22:00", avg_price=120.0),
        profile=profile,
    )
    assert diagnostics.mock_reference.charge_avg_price_eur_per_mwh == 35.0
    assert diagnostics.mock_reference.discharge_avg_price_eur_per_mwh == 120.0
    assert diagnostics.mock_reference.raw_spread_eur_per_mwh == 85.0
    assert diagnostics.value_math == "EUR = EUR/MWh * MWh"

    provenance = build_forecast_provenance()
    assert provenance.price_unit == "EUR/MWh"
    assert "Weather features only" in provenance.weather_api_role

    print("Value diagnostics example passed.")


if __name__ == "__main__":
    main()
