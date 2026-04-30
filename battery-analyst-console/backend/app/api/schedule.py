from fastapi import APIRouter, HTTPException

from app.schemas.schedule import ScheduleRequest, ScheduleResponse
from app.scheduling.schedule_runner import run_schedule_analysis

router = APIRouter(tags=["schedule"])


@router.post("/schedule", response_model=ScheduleResponse)
def create_schedule(request: ScheduleRequest) -> ScheduleResponse:
    try:
        return run_schedule_analysis(request)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except FileNotFoundError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Schedule error: {error}") from error
