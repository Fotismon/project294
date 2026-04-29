# Scheduling

This folder contains scheduling utilities for future battery operation workflows.

Task 4.1 adds rolling candidate windows over a 96-interval forecast day, where each interval represents 15 minutes.
Task 4.2 adds charge/discharge window pairing. Valid pairs require the charge window to occur before the discharge window and enough rest between actions.

Later tasks will apply round-trip efficiency, expected value calculations, SoC feasibility, and battery stress scoring.
