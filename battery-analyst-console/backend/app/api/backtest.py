from fastapi import APIRouter, HTTPException

from app.data.market_prices import get_market_price_coverage
from app.schemas.backtest import (
    BacktestCoverageResponse,
    BacktestRequest,
    BacktestResponse,
)
from app.scheduling.backtest_runner import run_lightweight_backtest

router = APIRouter(tags=["backtest"])


@router.get("/backtest/coverage", response_model=BacktestCoverageResponse)
def get_backtest_coverage() -> BacktestCoverageResponse:
    coverage = get_market_price_coverage()
    return BacktestCoverageResponse(
        source=coverage["source"],
        earliest_date=coverage["earliest_date"],
        latest_date=coverage["latest_date"],
    )


@router.post("/backtest", response_model=BacktestResponse)
def run_backtest(request: BacktestRequest) -> BacktestResponse:
    try:
        return run_lightweight_backtest(request)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
