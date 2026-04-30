from pydantic import BaseModel, Field


class FleetAssetConfig(BaseModel):
    id: str = Field(..., description="Stable battery asset identifier.")
    name: str = Field(..., description="Human-readable battery asset name.")
    site: str = Field(..., description="Asset site or grid node.")
    status: str = Field("available", description="Asset availability status.")
    profile_name: str = Field(..., description="Battery operating profile used by this asset.")
    power_mw: float = Field(..., gt=0, description="Maximum asset power in MW.")
    capacity_mwh: float = Field(..., gt=0, description="Usable asset capacity in MWh.")
    soc: float = Field(0.5, ge=0, le=1, description="Current state of charge fraction.")
    temperature_c: float = Field(25.0, description="Current asset temperature in C.")


FLEET_ASSETS: tuple[FleetAssetConfig, ...] = tuple(
    FleetAssetConfig(
        id=f"gr-bess-{index:02d}",
        name=f"Greek BESS {index:02d}",
        site="GR Storage Portfolio",
        status="available",
        profile_name="greece_100mw_300mwh",
        power_mw=100.0,
        capacity_mwh=300.0,
        soc=0.5,
        temperature_c=25.0,
    )
    for index in range(1, 11)
)


def list_fleet_assets() -> list[FleetAssetConfig]:
    return list(FLEET_ASSETS)


def list_dispatchable_fleet_assets() -> list[FleetAssetConfig]:
    return [asset for asset in FLEET_ASSETS if asset.status != "offline"]

