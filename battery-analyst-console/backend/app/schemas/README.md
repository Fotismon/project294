# Schemas

This folder contains Pydantic API request and response contracts for the backend.
Schemas define the shape of data exchanged with API endpoints before endpoint logic is implemented.

Current schema modules cover schedule, forecast, scenario, and backtest API contracts.
Schedule and scenario requests accept `optimizer_mode`: `window_v1`, `milp`, or `auto`.
MILP is not implemented yet; `milp` and `auto` currently fall back to `window_v1` with optimizer metadata.
Schedule and scenario responses include physical dispatch diagnostics such as EFC, auxiliary load, SoC violations, grid limit checks, and ramp-rate violations.
The scenario schema includes override inputs for profile assumptions, forecast prices, temperatures, risk appetite, and confidence metadata.
The backtest schema includes single-date historical backtest request and response contracts with realized window and economic result sections.
