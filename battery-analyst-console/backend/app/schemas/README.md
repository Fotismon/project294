# Schemas

This folder contains Pydantic API request and response contracts for the backend.
Schemas define the shape of data exchanged with API endpoints before endpoint logic is implemented.

Current schema modules cover schedule, forecast, scenario, and backtest API contracts.
The scenario schema includes override inputs for profile assumptions, forecast prices, temperatures, risk appetite, and confidence metadata.
The backtest schema includes single-date historical backtest request and response contracts with realized window and economic result sections.
