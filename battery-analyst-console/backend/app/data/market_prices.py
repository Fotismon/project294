import csv
from pathlib import Path


def candidate_market_price_paths(csv_path: str | None = None) -> list[Path]:
    """Return candidate local CSV paths for market price data."""

    if csv_path is not None:
        return [Path(csv_path)]

    current_file = Path(__file__).resolve()
    repo_root = current_file.parents[3]
    return [
        repo_root / "data" / "market_prices.csv",
        current_file.parent / "market_prices.csv",
        repo_root / "backend" / "data" / "henex_dam_results.csv",
    ]


def market_price_source_label(path: Path) -> str:
    if path.name == "henex_dam_results.csv":
        return "henex_feature_store_mcp"
    return "market_prices_csv"


def normalize_market_price_row(row: dict, source: str) -> dict:
    if source == "henex_feature_store_mcp":
        timestamp = row.get("datetime", "")
        date = timestamp[:10]
        return {
            "date": date,
            "interval_index": row.get("SORT", ""),
            "price": row.get("mcp", ""),
            "temperature": row.get("temperature_2m", ""),
        }

    return row


def load_market_price_rows_with_source(
    csv_path: str | None = None,
) -> tuple[list[dict], str | None, Path | None]:
    """Load market price rows from the first available real market data source."""

    for path in candidate_market_price_paths(csv_path):
        if not path.exists():
            continue
        source = market_price_source_label(path)
        with path.open(newline="", encoding="utf-8") as csv_file:
            rows = [
                normalize_market_price_row(row, source)
                for row in csv.DictReader(csv_file)
            ]
        return rows, source, path

    return [], None, None


def load_market_price_rows(csv_path: str | None = None) -> list[dict]:
    """Load normalized market price rows from the first available local source."""

    rows, _source, _path = load_market_price_rows_with_source(csv_path)
    return rows


def get_market_price_coverage(csv_path: str | None = None) -> dict:
    rows, source, _path = load_market_price_rows_with_source(csv_path)
    dates = sorted({row["date"] for row in rows if row.get("date")})
    return {
        "source": source or "unavailable",
        "earliest_date": dates[0] if dates else None,
        "latest_date": dates[-1] if dates else None,
    }


def get_prices_for_date(
    date: str,
    csv_path: str | None = None,
) -> tuple[list[float], list[float] | None]:
    """Return 96 realized prices and optional temperatures for one date."""

    rows = [row for row in load_market_price_rows(csv_path) if row.get("date") == date]
    if not rows:
        coverage = get_market_price_coverage(csv_path)
        if coverage["earliest_date"] and coverage["latest_date"]:
            raise ValueError(
                f"No realized market price data found for date {date}. "
                f"Available range is {coverage['earliest_date']} to {coverage['latest_date']}."
            )
        raise ValueError("No realized market price data source is available.")

    for column in ("date", "interval_index", "price"):
        if column not in rows[0]:
            raise ValueError(f"Market price CSV is missing required column '{column}'.")

    rows.sort(key=lambda row: int(float(row["interval_index"])))
    if len(rows) != 96:
        raise ValueError(f"Expected 96 market price rows for {date}; found {len(rows)}.")

    prices = [float(row["price"]) for row in rows]
    raw_temperatures = [row.get("temperature") for row in rows]
    if any(raw_temperature in (None, "") for raw_temperature in raw_temperatures):
        return prices, None

    temperatures = [float(raw_temperature) for raw_temperature in raw_temperatures]
    return prices, temperatures


def get_prior_dates(
    date: str,
    lookback_days: int,
    csv_path: str | None = None,
) -> list[str]:
    """Return available prior dates before the target date, newest first."""

    if lookback_days <= 0:
        raise ValueError("lookback_days must be greater than 0.")

    rows = load_market_price_rows(csv_path)
    dates = sorted(
        {row["date"] for row in rows if row.get("date") and row["date"] < date},
        reverse=True,
    )
    return dates[:lookback_days]


def get_price_history_before_date(
    date: str,
    lookback_days: int,
    csv_path: str | None = None,
) -> list[list[float]]:
    """Return prior valid 96-interval price histories before the target date."""

    histories: list[list[float]] = []
    for prior_date in get_prior_dates(date, lookback_days, csv_path):
        try:
            prices, _temperatures = get_prices_for_date(prior_date, csv_path)
        except (KeyError, TypeError, ValueError):
            continue
        histories.append(prices)

    return histories
