from __future__ import annotations

from pathlib import Path
from datetime import datetime

import numpy as np
import pandas as pd
import requests

MODELS_DIR = Path(__file__).parent.parent.parent / "models"
_STORE_PATH = MODELS_DIR / "henex_dam_results (1).csv"

ATHENS_LAT = 37.9838
ATHENS_LON = 23.7275

# Cached feature store (loaded once per process).
_feature_store: pd.DataFrame | None = None


def load_feature_store() -> pd.DataFrame:
    global _feature_store
    if _feature_store is None:
        df = pd.read_csv(_STORE_PATH, parse_dates=["datetime"])
        df = df.sort_values("datetime").reset_index(drop=True)
        _feature_store = df
    return _feature_store


def fetch_weather_forecast(target_date: str) -> pd.DataFrame:
    """Fetch Open-Meteo hourly forecast for target_date and upsample to 15-min."""
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": ATHENS_LAT,
        "longitude": ATHENS_LON,
        "hourly": [
            "temperature_2m",
            "apparent_temperature",
            "direct_radiation",
            "wind_speed_10m",
            "cloud_cover",
        ],
        "timezone": "Europe/Athens",
        "wind_speed_unit": "ms",
        "forecast_days": 8,
    }
    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()["hourly"]

    df = pd.DataFrame({
        "datetime": pd.to_datetime(data["time"]),
        "temperature_2m": data["temperature_2m"],
        "apparent_temperature": data["apparent_temperature"],
        "direct_radiation": data["direct_radiation"],
        "wind_speed_10m": data["wind_speed_10m"],
        "cloud_cover": data["cloud_cover"],
    })

    target_dt = pd.Timestamp(target_date)
    day_df = df[df["datetime"].dt.date == target_dt.date()].copy()

    # Upsample hourly → 15-min by forward-fill.
    day_df = day_df.set_index("datetime")
    end = day_df.index.max() + pd.Timedelta(minutes=45)
    full_idx = pd.date_range(day_df.index.min(), end, freq="15min")
    day_df = day_df.reindex(full_idx).ffill()
    day_df.index.name = "datetime"
    return day_df.reset_index().head(96)


def _get_store_rows(store: pd.DataFrame, target_dt: pd.Timestamp, days_back: int) -> pd.DataFrame:
    """Return the 96 rows from `days_back` days before target_dt, or empty df."""
    lag_date = (target_dt - pd.Timedelta(days=days_back)).date()
    mask = store["datetime"].dt.date == lag_date
    rows = store[mask].sort_values("datetime").reset_index(drop=True)
    return rows if len(rows) == 96 else pd.DataFrame()


def build_inference_features(
    target_date: str,
    store: pd.DataFrame,
    weather: pd.DataFrame,
) -> pd.DataFrame:
    """Build the 96-row × 48-feature inference DataFrame for target_date."""
    target_dt = pd.Timestamp(target_date)
    slots = pd.date_range(target_dt, periods=96, freq="15min")
    df = pd.DataFrame({"datetime": slots})

    # ── Time features ────────────────────────────────────────────────────────
    df["hour"] = df["datetime"].dt.hour
    df["quarter"] = df["datetime"].dt.minute // 15
    df["slot"] = df["hour"] * 4 + df["quarter"]
    df["day_of_week"] = df["datetime"].dt.dayofweek
    df["month"] = df["datetime"].dt.month
    df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
    df["day_of_year"] = df["datetime"].dt.dayofyear
    df["hour_sin"] = np.sin(2 * np.pi * df["slot"] / 96)
    df["hour_cos"] = np.cos(2 * np.pi * df["slot"] / 96)
    df["month_sin"] = np.sin(2 * np.pi * df["month"] / 12)
    df["month_cos"] = np.cos(2 * np.pi * df["month"] / 12)

    # ── Price lag features ───────────────────────────────────────────────────
    for days, col in [(1, "mcp_lag_1d"), (2, "mcp_lag_2d"), (7, "mcp_lag_7d")]:
        lag_rows = _get_store_rows(store, target_dt, days)
        df[col] = lag_rows["mcp"].values if len(lag_rows) == 96 else np.nan

    # Rolling 7-day mean/std (over the 7 days prior to target, excluding target).
    past_start = target_dt - pd.Timedelta(days=7)
    past_mask = (store["datetime"] >= past_start) & (store["datetime"] < target_dt)
    past_mcp = store.loc[past_mask, "mcp"]
    df["mcp_roll7d_mean"] = past_mcp.mean() if len(past_mcp) > 0 else np.nan
    df["mcp_roll7d_std"] = past_mcp.std() if len(past_mcp) > 1 else np.nan

    # Derived from price lags.
    df["mcp_lag_1d_negative"] = (df["mcp_lag_1d"] < 10).astype(float)
    df["mcp_lag_7d_negative"] = (df["mcp_lag_7d"] < 10).astype(float)

    # Previous-day price spread (= daily_spread column in training data).
    lag1_rows = _get_store_rows(store, target_dt, 1)
    if len(lag1_rows) == 96:
        df["daily_spread"] = lag1_rows["mcp"].max() - lag1_rows["mcp"].min()
    else:
        df["daily_spread"] = np.nan

    # ── D+1 proxy: yesterday's supply-mix and IPTO features ─────────────────
    # These features come from HENEX/IPTO DAM results not yet available for D+1,
    # so we forward-fill yesterday's values as the best available proxy.
    yest_rows = _get_store_rows(store, target_dt, 1)
    proxy_cols = [
        "vol_res", "vol_gas", "vol_lignite", "vol_hydro", "vol_supply",
        "vol_storage", "vol_load", "net_imports_mwh", "res_share", "net_load",
        "price_range_sell", "supply_slope_at_mcp", "demand_volume",
        "net_load_mwh", "res_mwh", "net_load_minus_res", "res_penetration",
    ]
    for col in proxy_cols:
        if col in yest_rows.columns and len(yest_rows) == 96:
            df[col] = yest_rows[col].values
        else:
            df[col] = 0.0

    # ── IPTO lag features ────────────────────────────────────────────────────
    for days, col in [(1, "net_load_lag_1d"), (7, "net_load_lag_7d")]:
        lag_rows = _get_store_rows(store, target_dt, days)
        if "net_load_minus_res" in lag_rows.columns and len(lag_rows) == 96:
            df[col] = lag_rows["net_load_minus_res"].values
        else:
            df[col] = 0.0

    # ── Derived demand features ──────────────────────────────────────────────
    df["net_load_sq"] = df["net_load_minus_res"] ** 2
    df["net_load_cu"] = df["net_load_minus_res"] ** 3
    df["res_surplus"] = (df["net_load_minus_res"] < 0).astype(float)
    df["res_surplus_depth"] = df["net_load_minus_res"].clip(upper=0).abs()

    # ── Weather features from Open-Meteo ─────────────────────────────────────
    weather_cols = [
        "temperature_2m", "apparent_temperature", "direct_radiation",
        "wind_speed_10m", "cloud_cover",
    ]
    for col in weather_cols:
        if col in weather.columns and len(weather) >= 96:
            df[col] = weather[col].values[:96]
        else:
            df[col] = 0.0

    # Radiation lag from yesterday's feature store.
    if "direct_radiation" in yest_rows.columns and len(yest_rows) == 96:
        df["radiation_lag_1d"] = yest_rows["direct_radiation"].values
    else:
        df["radiation_lag_1d"] = 0.0

    return df.drop(columns=["datetime"])
