# Frontend Redesign Checkpoint

## Status

- Checkpoint time: 2026-04-29T17:47:38.5548893+03:00
- Branch: main
- Initial working tree: clean
- Build result: pass (`npm.cmd run build`)
- Typecheck result: pass (`npx.cmd tsc --noEmit`)
- Lint result: not run to completion. `npm.cmd run lint` invokes `next lint`, which prompts to configure ESLint because no ESLint config exists.

## Current working integrations

- `POST /schedule`: `getSchedule(...)` posts the generated scheduler input and maps the backend schedule response into the frontend `ScheduleResponse`.
- `POST /scenario`: `runScenario(...)` posts scenario assumptions plus forecast metadata and maps the backend response into `ScheduleResponse`.
- `POST /backtest`: `runBacktest(...)` posts the current single-date backtest request and maps the current backend backtest response shape.
- Alerts come from the latest schedule or scenario response. There is no dedicated backend `/alerts` dependency.
- API status banner shows connected, mock, error, and loading states.
- Sample scheduler input generator creates 96 interval prices and temperatures for MVP/demo backend calls.

## Current frontend structure

- `app/page.tsx` owns current dashboard state, API status, tab state, scenario inputs, backtest inputs, fleet local state, and alert updates.
- Dashboard UI components live in `components/dashboard`.
- API client, backend request builders, response mappers, and mock fallback tracking live in `lib/api.ts`.
- API and UI types live in `types/api.ts`.
- Sample backend inputs live in `lib/sample-inputs.ts`.

## Integration Details

- `/schedule` request includes `date`, `profile_name`, `prices`, `temperatures`, `forecast_confidence`, `market_volatility`, `forecast_uncertainty_width`, `data_quality_level`, and `minimum_margin_eur_per_mwh`.
- `/scenario` request includes `date`, `profile_name`, `prices`, `temperatures`, `round_trip_efficiency`, `duration_hours`, `max_cycles_per_day`, `degradation_cost_eur_per_mwh`, `temperature_policy`, `risk_appetite`, and forecast metadata.
- `/backtest` request includes `date`, `profile_name`, `lookback_days`, `forecast_method`, `market_volatility`, `data_quality_level`, and `minimum_margin_eur_per_mwh`.
- `sample-inputs.ts` currently generates 96 prices and 96 temperatures using base price `80`, charge window `11:00-13:00` at `35`, discharge window `20:00-22:00` at `120`, base temperature `25`, and `20:00-22:00` temperature `31`.

## Redesign Safety Rule

The visual redesign should preserve current API client behavior and should not change backend contracts.

## Known Limitations

- Backtest requires local historical `market_prices.csv` for real results.
- Fleet endpoints are still mock/fallback unless implemented later.
- `sample-inputs.ts` is temporary until real forecast integration exists.
- ESLint is not configured; `npm run lint` currently opens the Next.js ESLint setup prompt.

## Recommended Manual Checkpoint

Recommended manual checkpoint command:

```bash
git tag frontend-redesign-checkpoint
```
