from fastapi import APIRouter

from app.fleet.config import list_fleet_assets
from app.schemas.fleet import FleetAsset, FleetResponse, FleetSummary


router = APIRouter(prefix="/fleet", tags=["fleet"])


@router.get("", response_model=FleetResponse)
def get_fleet() -> FleetResponse:
    assets = [
        FleetAsset(
            id=asset.id,
            name=asset.name,
            site=asset.site,
            status=asset.status,
            capacity_mwh=asset.capacity_mwh,
            power_mw=asset.power_mw,
            soc=asset.soc,
            temperature_c=asset.temperature_c,
            profile_name=asset.profile_name,
        )
        for asset in list_fleet_assets()
    ]
    active_assets = [asset for asset in assets if asset.status != "offline"]
    average_soc = (
        sum(asset.soc for asset in active_assets) / len(active_assets)
        if active_assets
        else 0.0
    )
    summary = FleetSummary(
        total_assets=len(assets),
        available_assets=len(active_assets),
        total_capacity_mwh=round(sum(asset.capacity_mwh for asset in active_assets), 2),
        total_power_mw=round(sum(asset.power_mw for asset in active_assets), 2),
        average_soc=round(average_soc, 4),
        forecast_driven_action="idle",
        assets_charging=0,
        assets_discharging=0,
        assets_idle=len(active_assets),
        expected_value_eur=[0.0, 0.0],
    )
    return FleetResponse(assets=assets, summary=summary)

