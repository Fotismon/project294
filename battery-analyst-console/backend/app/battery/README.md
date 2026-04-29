# Battery

This folder contains battery-related configuration and helper utilities.

Current predefined operating profiles are `conservative`, `balanced`, `aggressive`, and `greece_100mw_300mwh`.
These profiles model different operating strategies and risk tolerances for future scheduling, scenario analysis, and backtesting work.

The `greece_100mw_300mwh` profile models a realistic Greek BESS asset:

- 100 MW / 300 MWh
- 85% round-trip efficiency
- 20 EUR/MWh degradation cost
- 10-90% SoC bounds
- 2% auxiliary load
- 100 MW grid connection limit
