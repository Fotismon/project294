# Frontend — Battery Analyst Console UI

Next.js 14 dashboard for monitoring and operating a fleet of Greek BESS assets. Displays live price forecasts, dispatch recommendations, scenario comparisons, backtests, and fleet-wide alerts.

---

## Quick Start

```bash
# From battery-analyst-console/frontend/
npm install
npm run dev
```

Or from the project root:

```bash
make run-frontend
```

The UI is available at `http://localhost:3000`. The backend must be running at `http://127.0.0.1:8000` (or the URL set in `.env.local`).

---

## Environment Variables

Create `frontend/.env.local` (gitignored) with:

```ini
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

The file already exists with this default value. Change it if the backend runs on a different host or port (e.g., in Docker: `http://backend:8000`).

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |

---

## Project Structure

```
frontend/
├── app/
│   ├── layout.tsx        Root layout — sets page metadata and HTML wrapper
│   ├── page.tsx          Main dashboard — state management and component orchestration
│   └── globals.css       Global styles, scrollbar overrides, font config
├── components/
│   ├── dashboard/        38 domain-specific feature panels
│   │   ├── DashboardShell.tsx          Main layout (sidebar + top bar + panel grid)
│   │   ├── TopBar.tsx                  Header with date, status, and quick actions
│   │   ├── SideNav.tsx                 Navigation between dashboard sections
│   │   ├── TabNav.tsx                  In-section tab switching
│   │   │
│   │   ├── FleetOverview.tsx           Aggregated fleet metrics (capacity, SoC, alerts)
│   │   ├── FleetSummaryCards.tsx       KPI cards — total MW, active assets, avg SoC
│   │   ├── FleetManagerSection.tsx     Fleet asset list with inline controls
│   │   ├── FleetBulkActions.tsx        Apply actions across multiple assets
│   │   ├── FleetAlertsPanel.tsx        Active warnings and constraint violations
│   │   ├── FleetRecommendationSummary.tsx  Aggregated decision summary across fleet
│   │   │
│   │   ├── BatteryAssetTable.tsx       Tabular view of all assets with status
│   │   ├── BatteryAssetDetailPanel.tsx  Detailed single-asset view
│   │   ├── BatteryActionSelector.tsx   Charge / discharge / idle action control
│   │   ├── BatteryStatusBadge.tsx      Inline status indicator
│   │   ├── BatteryStressCard.tsx       EFC, temperature risk, cycling stress
│   │   │
│   │   ├── MarketForecastSection.tsx   Forecast section wrapper
│   │   ├── ForecastChart.tsx           Recharts price quantile chart (p05/p50/p95)
│   │   │
│   │   ├── RecommendationSection.tsx   Recommendation section wrapper
│   │   ├── RecommendationCards.tsx     execute / caution / watch / hold decision cards
│   │   ├── OpinionatedRecommendationPanel.tsx  Analyst-style recommendation narrative
│   │   ├── AlternativesPanel.tsx       Alternative schedule options
│   │   ├── NoActionPanel.tsx           Displayed when recommendation is hold/watch
│   │   │
│   │   ├── ScenarioControls.tsx        Inputs for custom forecast prices and overrides
│   │   ├── ScenarioComparisonPanel.tsx Side-by-side baseline vs scenario results
│   │   │
│   │   ├── BacktestPanel.tsx           Date range selector and backtest results
│   │   ├── PerformancePnLPanel.tsx     Historical P&L visualization
│   │   │
│   │   ├── ExplanationPanel.tsx        SHAP-based forecast explanation
│   │   ├── ConstraintPanel.tsx         Active physical/economic constraints
│   │   ├── SoCFeasibilityCard.tsx      State-of-charge trajectory visualization
│   │   ├── DispatchDiagnosticsPanel.tsx  EFC, ramp-rate, grid limit diagnostics
│   │   ├── ValueDiagnosticsPanel.tsx   EUR value range and fleet economics
│   │   ├── ProfitHealthComparisonCard.tsx  Profile-vs-profile profitability comparison
│   │   ├── ScheduleTradeoffMatrix.tsx  Score breakdown matrix
│   │   │
│   │   ├── AlertCard.tsx               Individual alert with severity and details
│   │   ├── RiskAlertsView.tsx          Risk-focused alert summary
│   │   ├── ApiStatusBanner.tsx         Backend connectivity indicator
│   │   ├── MetricCard.tsx              Reusable metric display card
│   │   └── OptimizerBadge.tsx          Shows heuristic vs MILP optimizer mode
│   │
│   └── ui/               7 reusable primitive components
│       ├── ConfidenceBadge.tsx   Visual indicator for forecast confidence level
│       ├── DecisionBadge.tsx     Coloured badge for execute/caution/watch/hold
│       ├── StatusBadge.tsx       Generic discrete-value status badge
│       ├── StressBadge.tsx       Battery stress level indicator
│       ├── MetricCard.tsx        Labelled numeric metric card
│       ├── SectionPanel.tsx      Titled panel wrapper with optional actions
│       ├── EmptyState.tsx        Placeholder when a panel has no data
│       └── index.ts              Re-exports all ui/ components
│
├── lib/
│   └── api.ts            Typed HTTP client — all backend calls go through here
│
├── types/
│   └── api.ts            TypeScript interfaces for all API request/response shapes
│                         and UI domain enums (Decision, Confidence, Severity, etc.)
│
├── .env.local            API base URL for local development (gitignored)
├── next.config.js        Next.js config (strict mode, standalone output for Docker)
├── tailwind.config.js    Custom dark theme colour palette
├── tsconfig.json         TypeScript config with @/* path alias
└── package.json
```

---

## Architecture

### Data flow

```
page.tsx  ──fetch──▶  lib/api.ts  ──HTTP──▶  Backend API
    │
    │  useState / useMemo
    │
    ▼
DashboardShell
    ├── FleetOverview / FleetManagerSection
    ├── MarketForecastSection → ForecastChart
    ├── RecommendationSection → RecommendationCards
    ├── ScenarioComparisonPanel
    └── BacktestPanel
```

`page.tsx` owns all application state. It fetches data from the backend via `lib/api.ts` and passes it down as props. No component makes direct HTTP calls — all API communication is centralised in `lib/api.ts`.

### Key files

- **`lib/api.ts`** — change this file to update how the frontend talks to the backend (base URL, request shapes, error handling).
- **`types/api.ts`** — change this file when the backend API contract changes. All TypeScript types for requests, responses, and UI enums live here.
- **`app/page.tsx`** — change this file to add new sections, rearrange the dashboard layout, or wire up new API calls.

---

## Tech Stack

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | 14.2 | React framework (App Router) |
| `react` | 18.3 | UI rendering |
| `recharts` | 2.12 | Price forecast and P&L charts |
| `tailwindcss` | 3.4 | Utility-first styling |
| `typescript` | 5.4 | Type safety |

---

## Styling

The UI uses a custom dark theme defined in `tailwind.config.js`. Colours are semantic:

- `background` — main canvas
- `surface` — card / panel backgrounds
- `text-primary` / `text-secondary` / `text-muted` — text hierarchy
- `success` / `warning` / `error` / `info` — status colours

All components use Tailwind utility classes directly — there are no CSS modules or styled components.
