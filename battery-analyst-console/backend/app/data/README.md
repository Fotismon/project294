# Data

Backend-side data access helpers and ingestion adapters live here.

`market_prices.py` loads local CSV market data from `data/market_prices.csv` or `backend/app/data/market_prices.csv`.
The expected CSV format is `date`, `interval_index`, `price`, optional `timestamp`, and optional `temperature`.
