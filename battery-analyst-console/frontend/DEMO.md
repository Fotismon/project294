# Battery Analyst Console Demo Script

This demo shows how the console turns price forecasts into risk-aware battery operating decisions. The focus is not only profit maximization, but also battery stress, SoC feasibility, operational alerts, and no-action decisions.

## Prerequisites

- Backend running on http://127.0.0.1:8000
- Frontend running on http://localhost:3000
- Frontend started with NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
- Optional: historical market_prices.csv for real backtest results

Backend:

```bash
cd backend
source /Users/fotismon/project294/.venv/bin/activate
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000 npm run dev
```

## Demo flow

1. Open Fleet Overview

   Start on Fleet Overview. Point out the API status area and confirm whether the app is using live backend responses or demo fallback data.

2. Show recommendation

   Show the decision, confidence, expected value, and spread after efficiency. Explain that the recommendation is risk-adjusted, not simply the highest spread.

3. Open battery detail

   Click a battery in the Fleet Asset table. Show SoC, temperature, capacity, power, stress, selected action, and warnings. Explain how the fleet-level decision maps to individual asset impact.

4. Show profit vs stress tradeoff

   Open or highlight Profit vs Asset Health and the Schedule Tradeoff Matrix. Tell the story: "Schedule A may produce higher immediate value but more battery stress. Schedule B may have slightly lower expected value but better long-term asset health."

5. Run scenario

   Go to Scenario Analyst. Change one or two assumptions, such as risk appetite, temperature policy, round-trip efficiency, or degradation cost. Click "Recompute recommendation." Show the Base vs Scenario comparison.

6. Show alerts update

   Go to Alerts. Show alerts grouped by Critical, Warning, and Info. Explain that alerts come from the latest schedule or scenario response, not from a separate alerts endpoint.

7. Show no-action case

   Use a conservative or high-risk scenario if available. Show the No action recommended panel and say: "No-action is a valid operational recommendation when forecasted spread does not compensate for round-trip efficiency losses and degradation risk."

## Optional backtest demo

Open Backtest and run a backtest for a selected date.

If market_prices.csv exists, show realized value, value error, and forecast-vs-realized charge and discharge prices.

If historical CSV data is missing, show the Historical data unavailable state. This is expected until historical price data is added.

## Presenter talking points

- Forecasting is only the input; the product is decision support.
- The scheduler considers spread, round-trip efficiency, degradation cost, SoC feasibility, physical constraints, temperature risk, and confidence.
- The console supports fleet-level and battery-level inspection.
- The recommendation can be execute, execute with caution, watch, or hold.
- Hold/no-action is intentional when economics or risks are unattractive.
- Scenario Analyst lets operators test assumptions before dispatch.

## Demo data notes

- The frontend can use generated 96-interval demo forecast input.
- Real /schedule and /scenario calls work when the backend is running.
- /backtest requires historical CSV data for real results.
- If no CSV exists, the UI shows a missing historical data state or demo fallback.

## Known limitations for demo

- Forecast engine may still be mock or separately implemented.
- Fleet-level backend optimization is approximated in frontend asset views.
- Alternative stress and confidence may be approximated until backend exposes per-alternative scoring.
- Backtest requires local market_prices.csv.
- This is an MVP, not a full battery simulator.
