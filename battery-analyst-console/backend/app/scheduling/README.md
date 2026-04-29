# Scheduling

This folder contains scheduling utilities for future battery operation workflows.

Task 4.1 adds rolling candidate windows over a 96-interval forecast day, where each interval represents 15 minutes.
Task 4.2 adds charge/discharge window pairing. Valid pairs require the charge window to occur before the discharge window and enough rest between actions.
Task 4.3 adds economic filtering. It adjusts the charge price by round-trip efficiency and rejects schedules that do not exceed degradation cost plus the configured minimum margin.
Task 4.4 adds physical constraint filtering. It validates action duration, cycle limit, rest time, temperature thresholds, and power/duration plausibility.

This is still not a full SoC simulator. Later tasks will add SoC feasibility, battery stress scoring, and final response assembly.
