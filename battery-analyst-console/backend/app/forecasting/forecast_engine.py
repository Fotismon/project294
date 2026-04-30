from __future__ import annotations

import json
import pickle
from pathlib import Path

import numpy as np
import pandas as pd

from app.schemas.forecast import ForecastPoint, ForecastResponse

MODELS_DIR = Path(__file__).parent.parent.parent / "models"


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
