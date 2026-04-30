# Scheduling

This folder contains scheduling utilities for future battery operation workflows.

Task 4.1 adds rolling candidate windows over a 96-interval forecast day, where each interval represents 15 minutes.
Task 4.2 adds charge/discharge window pairing. Valid pairs require the charge window to occur before the discharge window and enough rest between actions.
Task 4.3 adds economic filtering. It adjusts the charge price by round-trip efficiency and rejects schedules that do not exceed degradation cost plus the configured minimum margin.
Task 4.4 adds physical constraint filtering. It validates action duration, cycle limit, rest time, temperature thresholds, and power/duration plausibility.
Task 5.1 adds a lightweight SoC feasibility tracker. It tracks SoC over 96 15-minute intervals and checks whether a candidate schedule stays between `soc_min` and `soc_max`.
Task 5.2 adds raw charged/discharged MWh and Equivalent Full Cycles. EFC is calculated as `total_MWh_discharged / capacity_mwh` and will later feed battery stress scoring.
Task 6.1 adds transparent rule-based scoring. It combines spread quality, forecast confidence, temperature risk, battery stress, and uncertainty penalties into a simple explainable MVP score.
Task 6.2 adds battery stress scoring. It uses EFC, temperature risk, action duration intensity, rapid switching risk, and weak economic spread as simple MVP risk indicators.
Task 6.3 adds decision confidence scoring. It uses spread strength, forecast uncertainty width, data quality level, temperature risk, and SoC feasibility as an explainable MVP confidence indicator.
Task 6.4 adds the final recommendation builder. It combines score, stress, confidence, economics, physical constraints, and SoC feasibility into `execute`, `execute_with_caution`, `watch`, or `hold`.
Task 8.1 adds backend-generated analyst alerts for no-go days, forecast uncertainty, temperature risk, weak spread, SoC feasibility, and data quality.
Task 8.2 wires generated analyst alerts into `/scenario`, alongside scenario metadata alerts for temperature policy, risk appetite, effective margin, and applied overrides.
`schedule_runner.py` connects the same internal pipeline to `/schedule` using caller-provided 96-interval forecast prices until the forecast engine is integrated.

`/scenario` now includes no-go day, forecast uncertainty, temperature risk, weak spread, SoC feasibility, data quality, and scenario metadata alerts. These alerts are analyst warnings, not external notifications. This is not a full simulator or degradation model: it does not model nonlinear battery behavior, aging curves, thermal capacity effects, ramp rates, or execution uncertainty.

## Profitability / hurdle-cost check

The profitability helper explains the hurdle price that a discharge window must clear after efficiency and degradation cost:

```text
energy_input_required_mwh = 1 / round_trip_efficiency
rte_adjusted_charge_cost = charge_price / round_trip_efficiency
total_hurdle_cost = rte_adjusted_charge_cost + degradation_cost_eur_per_mwh
net_profit = discharge_price - total_hurdle_cost
```

For RTE 0.85, charge 30 €/MWh, and degradation 20 €/MWh:

- 80 €/MWh discharge yields 24.71 €/MWh net profit.
- 120 €/MWh discharge yields 64.71 €/MWh net profit.

## Window Scheduler V1.2

The window scheduler now has an interval-level dispatch representation with
`charge_power_mw[96]`, `discharge_power_mw[96]`, `net_power_mw[96]`, and
`soc_trajectory[97]`. Dispatch blocks are extracted from these vectors so the
same shape can later describe MILP output.

V1.2 can identify multiple profitable discharge windows using the hurdle-cost
profitability check while keeping the public `charge_window` and
`discharge_window` fields for frontend compatibility. The primary response
windows represent the lowest-price charge block and highest-price discharge
block; additional selected dispatch blocks are described in explanation lines.

## Dispatch diagnostics

Schedule and scenario responses include physical dispatch diagnostics for the
window scheduler. The diagnostics report equivalent full cycles, auxiliary load
and auxiliary energy, simultaneous charge/discharge violations, grid connection
limit checks, terminal SoC error, SoC violation counts, and ramp-rate
violations.

These judge-facing metrics are computed for the current window scheduler and
use the same dispatch-vector shape that future MILP output can populate.

## MILP optimizer v1

`milp.py` contains a standalone PuLP-based battery dispatch optimizer. It is not
connected to `/schedule` or `/scenario` yet. The model enforces SoC bounds,
charge/discharge power limits, mutual exclusivity, daily cycle throughput,
terminal SoC tolerance, ramp-rate limits, grid connection limits, degradation
cost, and auxiliary load in the objective.

Run the standalone validation example from the backend folder:

```bash
python -m app.scheduling.milp_example
```

## MILP response conversion

`milp_response.py` converts standalone MILP dispatch results into the existing
`ScheduleResponse` contract without connecting MILP to the API. Primary charge
and discharge windows are extracted from dispatch blocks, diagnostics are
preserved, and optimizer metadata identifies the result as `milp_v1`.

API integration and fallback behavior are intentionally left for a later phase.

## Optimizer modes

`/schedule` and `/scenario` accept `optimizer_mode`:

- `window_v1`: transparent window-based scheduler.
- `milp`: mixed-integer optimizer over 96 intervals.
- `auto`: try MILP first, then fall back to `window_v1`.

Forced `milp` returns a valid hold response if MILP is infeasible or unavailable.
`auto` returns a `window_v1` response with `fallback_used=true` and a clear
fallback reason if MILP fails.

## Forecast provenance and fleet economics

Forecast prices are treated as `EUR/MWh`. Open-Meteo provides weather features
only; the backend price forecast is the LightGBM DAM model output. The scheduler
value math is:

```text
EUR = EUR/MWh * MWh
```

`/schedule` and `/scenario` remain single-profile compatible, but responses now
also include backend-configured fleet economics:

- `single_profile_expected_value_range_eur`
- `fleet_economics.fleet_expected_value_range_eur`
- active battery count
- total fleet power MW
- total fleet capacity MWh

The backend fleet config is the source of truth for scaling. The frontend does
not scale economics from mock assets.

Run the value diagnostics example from the backend folder:

```bash
python -m app.scheduling.value_diagnostics_example
```
