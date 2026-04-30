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


_SOC_VALUES = (0.42, 0.47, 0.51, 0.56, 0.61, 0.66, 0.58, 0.53, 0.49, 0.72)
_TEMPERATURE_VALUES = (24.1, 25.3, 26.0, 27.4, 28.2, 29.1, 30.2, 25.8, 24.7, 31.0)
_STATUS_VALUES = (
    "available",
    "available",
    "available",
    "available",
    "limited",
    "available",
    "available",
    "limited",
    "available",
    "available",
)


FLEET_ASSETS: tuple[FleetAssetConfig, ...] = tuple(
    FleetAssetConfig(
        id=f"gr-bess-{index:02d}",
        name=f"Greek BESS {index:02d}",
        site="GR Storage Portfolio",
        status=_STATUS_VALUES[index - 1],
        profile_name="greece_100mw_300mwh",
        power_mw=100.0,
        capacity_mwh=300.0,
        soc=_SOC_VALUES[index - 1],
        temperature_c=_TEMPERATURE_VALUES[index - 1],
    )
    for index in range(1, 11)
)


def list_fleet_assets() -> list[FleetAssetConfig]:
    return list(FLEET_ASSETS)


def list_dispatchable_fleet_assets() -> list[FleetAssetConfig]:
    return [asset for asset in FLEET_ASSETS if asset.status != "offline"]
