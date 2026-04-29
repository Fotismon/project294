from fastapi import APIRouter, HTTPException

from app.schemas.backtest import BacktestRequest, BacktestResponse
from app.scheduling.backtest_runner import run_lightweight_backtest

router = APIRouter(tags=["backtest"])


@router.post("/backtest", response_model=BacktestResponse)
def run_backtest(request: BacktestRequest) -> BacktestResponse:
    try:
        return run_lightweight_backtest(request)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
