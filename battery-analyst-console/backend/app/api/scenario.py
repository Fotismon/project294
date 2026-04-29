from fastapi import APIRouter, HTTPException

from app.schemas.scenario import ScenarioOverrideRequest
from app.schemas.schedule import ScheduleResponse
from app.scheduling.scenario_runner import run_scenario_analysis

router = APIRouter(tags=["scenario"])


@router.post("/scenario", response_model=ScheduleResponse)
def run_scenario(request: ScenarioOverrideRequest) -> ScheduleResponse:
    try:
        return run_scenario_analysis(request)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
