# Schemas

This folder contains Pydantic API request and response contracts for the backend.
Schemas define the shape of data exchanged with API endpoints before endpoint logic is implemented.

Current schema modules cover schedule, forecast, scenario, and backtest API contracts.
Schedule, scenario, and backtest requests use `optimizer_mode: milp`.
MILP is the only supported scheduler exposed through the API.
Schedule and scenario responses include physical dispatch diagnostics such as EFC, auxiliary load, SoC violations, grid limit checks, and ramp-rate violations.
The scenario schema includes override inputs for profile assumptions, forecast prices, temperatures, risk appetite, and confidence metadata.
The backtest schema includes single-date historical backtest request and response contracts with realized window and economic result sections.
