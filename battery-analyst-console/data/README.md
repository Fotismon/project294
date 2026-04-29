# Data

Shared project data folder for future sample files, exports, and analysis inputs.

Historical market prices should be placed in `market_prices.csv` with these columns:

- `date` in `YYYY-MM-DD` format
- `interval_index` from `0` to `95`
- `price` in EUR/MWh
- optional `timestamp`
- optional `temperature`

The backend also checks `backend/app/data/market_prices.csv`. Sample/mock data should use a separate filename such as `market_prices_sample.csv`.
