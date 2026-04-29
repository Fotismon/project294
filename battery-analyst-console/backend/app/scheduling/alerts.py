from pydantic import BaseModel, Field

from app.schemas.schedule import Alert
from app.scheduling.recommendation import FinalRecommendation


SEVERITY_ORDER = {"critical": 0, "warning": 1, "info": 2}


class AnalystAlert(BaseModel):
    """Backend-generated analyst alert for schedule review."""

    severity: str = Field(..., description="Alert severity: info, warning, or critical.")
    title: str = Field(..., description="Short alert title.")
    message: str = Field(..., description="Human-readable alert message.")
    recommended_action: str = Field(..., description="Suggested analyst action.")
    metric: str | None = Field(None, description="Metric or category associated with the alert.")


def generate_no_go_day_alerts(
    recommendation: FinalRecommendation,
) -> list[AnalystAlert]:
    """Generate a critical no-go alert when the recommendation is hold."""

    if recommendation.decision != "hold":
        return []

    hold_reason_text = " ".join(recommendation.hold_reasons)
    message = "No executable schedule is currently recommended."
    if hold_reason_text:
        message = f"{message} Reasons: {hold_reason_text}"

    return [
        AnalystAlert(
            severity="critical",
            title="No-go day",
            message=message,
            recommended_action="Hold operation and review scenario assumptions.",
            metric="decision",
        )
    ]


def generate_forecast_uncertainty_alerts(
    forecast_uncertainty_width: float | None = None,
    warning_threshold: float = 50.0,
    critical_threshold: float = 80.0,
) -> list[AnalystAlert]:
    """Generate alerts for forecast uncertainty width."""

    if forecast_uncertainty_width is None:
        return [
            AnalystAlert(
                severity="info",
                title="Forecast uncertainty unavailable",
                message="Forecast uncertainty data was not provided.",
                recommended_action="Continue with caution and validate forecast assumptions.",
                metric="forecast_uncertainty_width",
            )
        ]

    if forecast_uncertainty_width >= critical_threshold:
        return [
            AnalystAlert(
                severity="critical",
                title="High forecast uncertainty",
                message=(
                    f"Forecast uncertainty width is {forecast_uncertainty_width} EUR/MWh, "
                    "which exceeds the critical threshold."
                ),
                recommended_action="Avoid execution or wait for a more reliable forecast.",
                metric="forecast_uncertainty_width",
            )
        ]

    if forecast_uncertainty_width >= warning_threshold:
        return [
            AnalystAlert(
                severity="warning",
                title="Elevated forecast uncertainty",
                message=(
                    f"Forecast uncertainty width is {forecast_uncertainty_width} EUR/MWh, "
                    "which exceeds the warning threshold."
                ),
                recommended_action="Use caution and consider lower risk appetite.",
                metric="forecast_uncertainty_width",
            )
        ]

    return []


def generate_temperature_alerts(
    recommendation: FinalRecommendation,
) -> list[AnalystAlert]:
    """Generate alerts for temperature warning or avoid-threshold risk."""

    if recommendation.selected is None:
        return []

    physical_result = recommendation.selected.soc_result.physical_result
    if not physical_result.temperature_ok:
        return [
            AnalystAlert(
                severity="critical",
                title="High temperature risk",
                message="Temperature avoid threshold is reached during the schedule.",
                recommended_action="Avoid execution or use a stricter temperature policy.",
                metric="temperature",
            )
        ]

    if physical_result.temperature_warning:
        warning_text = " ".join(physical_result.warning_reasons)
        message = "Temperature warning is active during charge or discharge."
        if warning_text:
            message = f"{message} Reasons: {warning_text}"
        return [
            AnalystAlert(
                severity="warning",
                title="Temperature warning",
                message=message,
                recommended_action="Monitor temperature and consider reduced risk appetite.",
                metric="temperature",
            )
        ]

    return []


def generate_weak_spread_alerts(
    recommendation: FinalRecommendation,
    weak_spread_threshold_eur_per_mwh: float = 20.0,
) -> list[AnalystAlert]:
    """Generate alerts when spread after efficiency is weak or negative."""

    if recommendation.selected is None:
        return []

    economic_schedule = (
        recommendation.selected.soc_result.physical_result.economic_schedule
    )
    spread_after_efficiency = economic_schedule.spread_after_efficiency

    if spread_after_efficiency <= 0:
        return [
            AnalystAlert(
                severity="critical",
                title="Negative spread after efficiency",
                message="Spread after efficiency is not positive.",
                recommended_action="Hold execution.",
                metric="spread_after_efficiency",
            )
        ]

    if spread_after_efficiency < weak_spread_threshold_eur_per_mwh:
        return [
            AnalystAlert(
                severity="warning",
                title="Weak spread",
                message=(
                    f"Spread after efficiency is {spread_after_efficiency} EUR/MWh, "
                    "below the weak spread threshold."
                ),
                recommended_action="Wait for stronger price separation.",
                metric="spread_after_efficiency",
            )
        ]

    return []


def generate_soc_feasibility_alerts(
    recommendation: FinalRecommendation,
) -> list[AnalystAlert]:
    """Generate alerts for SoC infeasibility or proximity to SoC bounds."""

    if recommendation.selected is None:
        return []

    soc_result = recommendation.selected.soc_result
    if not soc_result.feasible:
        violation_text = " ".join(violation.reason for violation in soc_result.violations)
        message = "Schedule is not SoC feasible."
        if violation_text:
            message = f"{message} Violations: {violation_text}"
        return [
            AnalystAlert(
                severity="critical",
                title="SoC infeasible",
                message=message,
                recommended_action="Adjust initial SoC, reduce duration, or hold.",
                metric="soc_feasibility",
            )
        ]

    alerts: list[AnalystAlert] = []
    buffer = 0.05
    if soc_result.min_soc_reached <= soc_result.min_soc_allowed + buffer:
        alerts.append(
            AnalystAlert(
                severity="warning",
                title="SoC near lower limit",
                message=(
                    f"Minimum SoC reached {soc_result.min_soc_reached}, close to "
                    f"allowed minimum {soc_result.min_soc_allowed}."
                ),
                recommended_action="Confirm starting SoC or reduce discharge exposure.",
                metric="soc_feasibility",
            )
        )

    if soc_result.max_soc_reached >= soc_result.max_soc_allowed - buffer:
        alerts.append(
            AnalystAlert(
                severity="warning",
                title="SoC near upper limit",
                message=(
                    f"Maximum SoC reached {soc_result.max_soc_reached}, close to "
                    f"allowed maximum {soc_result.max_soc_allowed}."
                ),
                recommended_action="Confirm capacity headroom or reduce charge exposure.",
                metric="soc_feasibility",
            )
        )

    return alerts


def generate_data_quality_alerts(
    data_quality_level: str = "medium",
) -> list[AnalystAlert]:
    """Generate alerts for medium or low input data quality."""

    if data_quality_level == "high":
        return []

    if data_quality_level == "low":
        return [
            AnalystAlert(
                severity="warning",
                title="Low data quality",
                message="Input data quality is low.",
                recommended_action="Avoid aggressive execution and review data sources.",
                metric="data_quality",
            )
        ]

    return [
        AnalystAlert(
            severity="info",
            title="Medium data quality",
            message="Input data quality is medium.",
            recommended_action="Continue but validate assumptions.",
            metric="data_quality",
        )
    ]


def generate_alerts(
    recommendation: FinalRecommendation,
    forecast_uncertainty_width: float | None = None,
    data_quality_level: str = "medium",
    weak_spread_threshold_eur_per_mwh: float = 20.0,
) -> list[AnalystAlert]:
    """Generate sorted analyst alerts for a final recommendation.

    Example:
        from app.scheduling.alerts import generate_alerts
        from app.scheduling.recommendation import build_final_recommendation

        # After building recommendation from the existing scheduling pipeline:
        alerts = generate_alerts(
            recommendation=recommendation,
            forecast_uncertainty_width=25.0,
            data_quality_level="medium",
        )
    """

    alerts = (
        generate_no_go_day_alerts(recommendation)
        + generate_forecast_uncertainty_alerts(forecast_uncertainty_width)
        + generate_temperature_alerts(recommendation)
        + generate_weak_spread_alerts(
            recommendation,
            weak_spread_threshold_eur_per_mwh=weak_spread_threshold_eur_per_mwh,
        )
        + generate_soc_feasibility_alerts(recommendation)
        + generate_data_quality_alerts(data_quality_level)
    )
    alerts.sort(key=lambda alert: SEVERITY_ORDER.get(alert.severity, 2))
    return alerts


def convert_analyst_alert_to_schedule_alert(alert: AnalystAlert) -> Alert:
    """Convert an analyst alert into the existing ScheduleResponse Alert schema."""

    return Alert(
        level=alert.severity,
        message=(
            f"{alert.title}: {alert.message} "
            f"Recommended action: {alert.recommended_action}"
        ),
        metric=alert.metric,
    )
