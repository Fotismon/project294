from fastapi import APIRouter

from app.schemas.schedule import (
    Alert,
    AlternativeSchedule,
    BatteryStress,
    PhysicalConstraints,
    ScheduleRequest,
    ScheduleResponse,
    SoCFeasibility,
    Window,
)

router = APIRouter(tags=["schedule"])


@router.post("/schedule", response_model=ScheduleResponse)
def create_schedule(request: ScheduleRequest) -> ScheduleResponse:
    return ScheduleResponse(
        date=request.date,
        decision="execute_with_caution",
        confidence="medium_high",
        charge_window=Window(start="11:00", end="13:00", avg_price=38.4),
        discharge_window=Window(start="20:00", end="22:00", avg_price=116.8),
        spread_after_efficiency=71.6,
        expected_value_range_eur=[120, 180],
        soc_feasibility=SoCFeasibility(
            feasible=True,
            min_soc=request.battery.min_soc,
            max_soc=request.battery.max_soc,
            start_soc=request.battery.current_soc,
            end_soc=max(request.battery.min_soc, request.battery.current_soc - 0.01),
            violations=[],
        ),
        battery_stress=BatteryStress(
            level="medium",
            score=42,
            reasons=[
                "one cycle only",
                "temperature risk during discharge window",
                "no rapid switching",
            ],
        ),
        physical_constraints=PhysicalConstraints(
            duration_ok=True,
            cycle_limit_ok=request.battery.max_cycles_per_day >= 1,
            temperature_ok=True,
            round_trip_efficiency_applied=True,
            rapid_switching_avoided=True,
        ),
        alternatives=[
            AlternativeSchedule(
                label="lower_stress_option",
                charge_window=Window(start="10:00", end="12:00", avg_price=42.1),
                discharge_window=Window(start="19:00", end="21:00", avg_price=108.9),
                expected_value_range_eur=[95, 145],
                reason="Lower expected value but slightly earlier discharge window.",
            )
        ],
        alerts=[
            Alert(
                level="warning",
                message="Mock response only; no live market or battery telemetry applied.",
                metric="mock_data",
            )
        ],
        explanation=[
            "The mock spread is strongest between midday charging and evening discharge.",
            "Battery constraints are treated as feasible using the submitted profile.",
        ],
    )
