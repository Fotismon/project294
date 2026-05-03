from __future__ import annotations

import json
import pickle
from pathlib import Path

import numpy as np
import pandas as pd

from app.schemas.forecast import (
    ForecastPoint,
    ForecastResponse,
    ShapFeatureContribution,
    ShapSlotExplanation,
)

MODELS_DIR = Path(__file__).parent.parent.parent / "models"
CACHE_DIR  = Path(__file__).parent.parent.parent / "cache"
_SHAP_PATH = CACHE_DIR / "shap_per_slot.csv"
_shap_rows: pd.DataFrame | None = None


def _load_models() -> tuple[dict, list[str]]:
    models: dict = {}
    for quantile in ("p05", "p50", "p95"):
        path = MODELS_DIR / f"lgbm_{quantile}.pkl"
        if not path.exists():
            raise FileNotFoundError(
                f"Model file not found: {path}. "
                "Copy lgbm_p05.pkl / lgbm_p50.pkl / lgbm_p95.pkl from Google Drive "
                "into the backend/models/ directory."
            )
        with open(path, "rb") as f:
            models[quantile] = pickle.load(f)

    feature_list_path = MODELS_DIR / "feature_list.json"
    if not feature_list_path.exists():
        raise FileNotFoundError(f"feature_list.json not found at {feature_list_path}.")
    with open(feature_list_path) as f:
        feature_list: list[str] = json.load(f)

    return models, feature_list


# Load models once at module import (singleton).
_models, _feature_list = _load_models()


def _band_to_confidence(band_width: float) -> str:
    if band_width < 20:
        return "high"
    if band_width < 40:
        return "medium_high"
    if band_width < 60:
        return "medium"
    return "low"


def _predict(model, X: pd.DataFrame) -> np.ndarray:
    # Use the underlying LightGBM Booster directly to avoid sklearn wrapper
    # compatibility issues between the pickled training version and the
    # currently installed LightGBM.
    return model.booster_.predict(X.values)


def _load_shap_rows() -> pd.DataFrame:
    global _shap_rows
    if _shap_rows is None:
        if not _SHAP_PATH.exists():
            _shap_rows = pd.DataFrame()
        else:
            rows = pd.read_csv(_SHAP_PATH, parse_dates=["datetime"])
            rows["slot"] = rows["datetime"].dt.hour * 4 + rows["datetime"].dt.minute // 15
            rows["date"] = rows["datetime"].dt.date.astype(str)
            _shap_rows = rows.sort_values("datetime").reset_index(drop=True)
    return _shap_rows


def _feature_label(feature: str) -> str:
    labels = {
        "mcp_lag_1d": "yesterday's same-slot price",
        "mcp_lag_2d": "two-day lagged price",
        "mcp_lag_7d": "same weekday price last week",
        "mcp_roll7d_mean": "7-day slot average price",
        "mcp_roll7d_std": "7-day slot volatility",
        "hourly_trend": "recent hourly price trend",
        "day_of_week": "day-of-week pattern",
        "direct_radiation": "solar radiation forecast",
        "cloud_cover": "cloud-cover forecast",
        "wind_speed_10m": "wind forecast",
        "temperature_2m": "temperature forecast",
        "net_load_forecast_proxy": "net-load proxy",
        "res_forecast_proxy": "renewables forecast proxy",
        "demand_forecast_proxy": "demand forecast proxy",
    }
    return labels.get(feature, feature.replace("_", " "))


def _shap_explanation_for_slot(target_date: str, slot_index: int) -> ShapSlotExplanation | None:
    rows = _load_shap_rows()
    if rows.empty:
        return None

    exact = rows[(rows["date"] == target_date) & (rows["slot"] == slot_index)]
    if not exact.empty:
        row = exact.iloc[0]
        source = "historical_shap_per_slot"
    else:
        latest_date = str(rows["date"].max())
        fallback = rows[(rows["date"] == latest_date) & (rows["slot"] == slot_index)]
        if fallback.empty:
            return None
        row = fallback.iloc[0]
        source = "historical_shap_slot_proxy"

    contributions: list[ShapFeatureContribution] = []
    for rank in range(1, 6):
        feature = row.get(f"top_feature_{rank}")
        contribution = row.get(f"top_shap_{rank}")
        if pd.isna(feature) or pd.isna(contribution):
            continue
        value = round(float(contribution), 2)
        contributions.append(
            ShapFeatureContribution(
                feature=_feature_label(str(feature)),
                contribution_eur_per_mwh=value,
                direction="up" if value >= 0 else "down",
            )
        )

    return ShapSlotExplanation(
        source=source,
        explanation_date=str(row["date"]),
        confidence_score=(
            round(float(row["confidence"]), 4)
            if "confidence" in row and not pd.isna(row["confidence"])
            else None
        ),
        actual_price_eur_per_mwh=(
            round(float(row["actual"]), 2)
            if "actual" in row and not pd.isna(row["actual"])
            else None
        ),
        model_price_eur_per_mwh=(
            round(float(row["p50"]), 2)
            if "p50" in row and not pd.isna(row["p50"])
            else None
        ),
        top_contributions=contributions,
    )


def run_forecast(target_date: str, X: pd.DataFrame) -> ForecastResponse:
    """Run the three quantile models and return a ForecastResponse with 96 points."""
    X_ordered = X[_feature_list]

    raw_p05 = _predict(_models["p05"], X_ordered)
    raw_p50 = _predict(_models["p50"], X_ordered)
    raw_p95 = _predict(_models["p95"], X_ordered)

    # Enforce monotonicity: p05 ≤ p50 ≤ p95.
    p50 = raw_p50
    p05 = np.minimum(raw_p05, p50)
    p95 = np.maximum(raw_p95, p50)

    slots = pd.date_range(target_date, periods=96, freq="15min", tz="Europe/Athens")
    band_widths = p95 - p05
    avg_band_width = float(np.mean(band_widths))
    q90_band_width = float(np.quantile(band_widths, 0.9))
    if q90_band_width <= 0:
        confidence_scores = np.ones_like(band_widths)
    else:
        confidence_scores = np.clip(1 - (band_widths / q90_band_width), 0, 1)
    daily_min_p50 = float(np.min(p50))
    arbitrage_signals = p50 - daily_min_p50
    risk_adjusted_prices = confidence_scores * p50 + (1 - confidence_scores) * p05

    points = [
        ForecastPoint(
            timestamp=slots[i].isoformat(),
            predicted_price=round(float(p50[i]), 2),
            lower_bound=round(float(p05[i]), 2),
            upper_bound=round(float(p95[i]), 2),
            confidence=_band_to_confidence(float(band_widths[i])),
            confidence_score=round(float(confidence_scores[i]), 4),
            arbitrage_signal=round(float(arbitrage_signals[i]), 2),
            risk_adjusted_price=round(float(risk_adjusted_prices[i]), 2),
            shap_explanation=_shap_explanation_for_slot(target_date, i),
        )
        for i in range(96)
    ]

    return ForecastResponse(
        date=target_date,
        market="day_ahead",
        country="GR",
        unit="EUR/MWh",
        points=points,
        avg_band_width_eur=round(avg_band_width, 2),
    )
