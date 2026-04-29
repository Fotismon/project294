# API

This folder contains FastAPI router modules for the backend API.

Current mock endpoints:

- `GET /health`
- `GET /forecast`
- `POST /schedule`
- `POST /scenario`
- `POST /backtest`

`POST /scenario` now runs the internal scenario pipeline with battery profile overrides, forecast prices, optional temperatures, and scenario risk settings.
`POST /schedule` now runs the real scheduler pipeline using caller-provided 96-interval forecast prices.
