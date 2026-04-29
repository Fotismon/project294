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

This is not a full simulator or degradation model: it does not model nonlinear battery behavior, aging curves, thermal capacity effects, ramp rates, or execution uncertainty. Later tasks will add final response assembly.
