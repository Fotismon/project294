from fastapi import APIRouter

from app.schemas.backtest import BacktestRequest, BacktestResponse, BacktestSummary

router = APIRouter(tags=["backtest"])


@router.post("/backtest", response_model=BacktestResponse)
def run_backtest(request: BacktestRequest) -> BacktestResponse:
    summary = BacktestSummary(
        total_days=30,
        profitable_days=21,
        skipped_days=9,
        total_expected_value_eur=3840.0,
        average_daily_value_eur=128.0,
    )

    return BacktestResponse(
        start_date=request.start_date,
        end_date=request.end_date,
        strategy=request.strategy,
        summary=summary,
        notes=[
            "Mock backtest summary for frontend integration.",
            "No historical market replay or battery simulation has been run yet.",
        ],
    )
