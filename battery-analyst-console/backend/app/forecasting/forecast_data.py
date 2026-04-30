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

    if day_df.empty:
        # target_date is outside the 8-day forecast window; return zeros
        slots = pd.date_range(target_dt, periods=96, freq="15min")
        return pd.DataFrame({
            "datetime": slots,
            "temperature_2m": 20.0,
            "apparent_temperature": 20.0,
            "direct_radiation": 0.0,
            "wind_speed_10m": 3.0,
            "cloud_cover": 50.0,
        })

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
    """Build the 96-row inference DataFrame matching the 46 features in feature_list.json.

    Mirrors engineer_features() from the training notebook, adapted for single-day
    inference where only historical store data is available (no same-day realized values).
    """
    target_dt = pd.Timestamp(target_date)
    slots = pd.date_range(target_dt, periods=96, freq="15min")
    df = pd.DataFrame({"datetime": slots})

    # ── Time features ─────────────────────────────────────────────────────────
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

    # ── MCP lag features ──────────────────────────────────────────────────────
    lag1_rows = _get_store_rows(store, target_dt, 1)
    lag2_rows = _get_store_rows(store, target_dt, 2)
    lag7_rows = _get_store_rows(store, target_dt, 7)

    df["mcp_lag_1d"] = lag1_rows["mcp"].values if len(lag1_rows) == 96 else np.nan
    df["mcp_lag_2d"] = lag2_rows["mcp"].values if len(lag2_rows) == 96 else np.nan
    df["mcp_lag_7d"] = lag7_rows["mcp"].values if len(lag7_rows) == 96 else np.nan

    past_start = target_dt - pd.Timedelta(days=7)
    past_mask = (store["datetime"] >= past_start) & (store["datetime"] < target_dt)
    past_mcp = store.loc[past_mask, "mcp"]
    df["mcp_roll7d_mean"] = past_mcp.mean() if len(past_mcp) > 0 else np.nan
    df["mcp_roll7d_std"] = past_mcp.std() if len(past_mcp) > 1 else np.nan

    # hourly_trend: rolling 4-slot mean of mcp_lag_1d (matches notebook)
    df["hourly_trend"] = df["mcp_lag_1d"].rolling(4, min_periods=1).mean()

    # ramp_1h: was price rising or falling at this slot yesterday?
    df["ramp_1h"] = df["mcp_lag_1d"] - df["mcp_lag_1d"].shift(4)

    df["mcp_lag_1d_negative"] = (df["mcp_lag_1d"] < 10).astype(float)
    df["mcp_lag_7d_negative"] = (df["mcp_lag_7d"] < 10).astype(float)

    # ── D+1 proxy features: yesterday's realized values as best available proxy ─
    if len(lag1_rows) == 96:
        df["net_load_forecast_proxy"] = (
            lag1_rows["net_load_minus_res"].values
            if "net_load_minus_res" in lag1_rows.columns
            else 0.0
        )
        df["res_forecast_proxy"] = (
            lag1_rows["res_mwh"].values
            if "res_mwh" in lag1_rows.columns
            else 0.0
        )
        df["demand_forecast_proxy"] = (
            lag1_rows["demand_volume"].values
            if "demand_volume" in lag1_rows.columns
            else 0.0
        )
    else:
        df["net_load_forecast_proxy"] = 0.0
        df["res_forecast_proxy"] = 0.0
        df["demand_forecast_proxy"] = 0.0

    if len(lag7_rows) == 96 and "net_load_minus_res" in lag7_rows.columns:
        df["net_load_lag_7d"] = lag7_rows["net_load_minus_res"].values
    else:
        df["net_load_lag_7d"] = 0.0

    df["net_load_proxy_sq"] = df["net_load_forecast_proxy"] ** 2
    df["net_load_proxy_cu"] = df["net_load_forecast_proxy"] ** 3
    df["res_surplus"] = (df["net_load_forecast_proxy"] < 0).astype(float)
    df["res_surplus_depth"] = df["net_load_forecast_proxy"].clip(upper=0).abs()

    # ── Weather features ──────────────────────────────────────────────────────
    for col in ["temperature_2m", "apparent_temperature", "direct_radiation",
                "wind_speed_10m", "cloud_cover"]:
        if col in weather.columns and len(weather) >= 96:
            df[col] = weather[col].values[:96]
        else:
            df[col] = 0.0

    df["solar_proxy"] = df["direct_radiation"] * (1 - df["cloud_cover"] / 100)
    df["wind_proxy"] = df["wind_speed_10m"] ** 3
    df["temp_stress"] = (df["temperature_2m"] - 20).abs()

    if len(lag1_rows) == 96 and "direct_radiation" in lag1_rows.columns:
        df["radiation_lag_1d"] = lag1_rows["direct_radiation"].values
    else:
        df["radiation_lag_1d"] = 0.0

    # ── AggrCurves market structure (lagged) ──────────────────────────────────
    if len(lag1_rows) == 96:
        df["slope_lag_1d"] = (
            lag1_rows["supply_slope_at_mcp"].values
            if "supply_slope_at_mcp" in lag1_rows.columns
            else 0.0
        )
        df["price_range_lag_1d"] = (
            lag1_rows["price_range_sell"].values
            if "price_range_sell" in lag1_rows.columns
            else 0.0
        )
        if "vol_supply" in lag1_rows.columns:
            vol_supply_lag = lag1_rows["vol_supply"].values.astype(float)
            df["market_tightness"] = df["demand_forecast_proxy"] / np.where(
                vol_supply_lag == 0, np.nan, vol_supply_lag
            )
        else:
            df["market_tightness"] = np.nan
    else:
        df["slope_lag_1d"] = 0.0
        df["price_range_lag_1d"] = 0.0
        df["market_tightness"] = np.nan

    # steep_supply: slope > median slope in the 7d window (or full store fallback)
    if "supply_slope_at_mcp" in store.columns:
        slope_series = store.loc[past_mask, "supply_slope_at_mcp"].dropna()
        slope_median = slope_series.median() if len(slope_series) > 0 else store["supply_slope_at_mcp"].median()
        df["steep_supply"] = (df["slope_lag_1d"] > slope_median).astype(int)
    else:
        df["steep_supply"] = 0

    # curve_volatility = price_range_lag_1d / |mcp_lag_1d|
    df["curve_volatility"] = df["price_range_lag_1d"] / df["mcp_lag_1d"].abs().replace(0, np.nan)

    # intraday_spread_signal: how far above yesterday's running minimum (rolling 96)
    df["intraday_spread_signal"] = (
        df["mcp_lag_1d"] - df["mcp_lag_1d"].rolling(96, min_periods=1).min()
    )

    # price_regime: which third of the price distribution is mcp_lag_1d in?
    # Use global store quantiles to match training distribution.
    store_mcp_q33 = store["mcp"].quantile(0.333)
    store_mcp_q67 = store["mcp"].quantile(0.667)
    df["price_regime"] = df["mcp_lag_1d"].apply(
        lambda x: 0 if pd.isna(x) or x <= store_mcp_q33
        else (1 if x <= store_mcp_q67 else 2)
    ).astype(int)

    # volatility_regime: is the 7d rolling std above the historical median?
    store_7d_stds = (
        store["mcp"]
        .rolling(window=672, min_periods=96)
        .std()
        .dropna()
    )
    std_threshold = store_7d_stds.median() if len(store_7d_stds) > 0 else 20.0
    current_std = df["mcp_roll7d_std"].iloc[0]
    df["volatility_regime"] = int(not pd.isna(current_std) and current_std > std_threshold)

    # prev_day_spread: yesterday's (max - min) MCP
    if len(lag1_rows) == 96:
        df["prev_day_spread"] = lag1_rows["mcp"].max() - lag1_rows["mcp"].min()
    else:
        df["prev_day_spread"] = np.nan

    return df.drop(columns=["datetime"])
