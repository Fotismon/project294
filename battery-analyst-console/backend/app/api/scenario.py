from fastapi import APIRouter

from app.schemas.scenario import ScenarioRequest, ScenarioResponse

router = APIRouter(tags=["scenario"])


@router.post("/scenario", response_model=ScenarioResponse)
def run_scenario(request: ScenarioRequest) -> ScenarioResponse:
    efficiency = request.efficiency_override or request.battery.round_trip_efficiency
    value_low = round(120 * request.price_multiplier * efficiency / 0.88, 2)
    value_high = round(180 * request.price_multiplier * efficiency / 0.88, 2)

    key_changes = [f"Applied price multiplier of {request.price_multiplier}."]
    if request.efficiency_override is not None:
        key_changes.append(f"Applied efficiency override of {request.efficiency_override}.")

    return ScenarioResponse(
        date=request.date,
        scenario_name="mock_price_efficiency_scenario",
        decision="execute_with_caution",
        expected_value_range_eur=[value_low, value_high],
        key_changes=key_changes,
        explanation=[
            "Scenario values are mocked from the baseline schedule value range.",
            "No optimization or battery simulation has been run yet.",
        ],
    )
