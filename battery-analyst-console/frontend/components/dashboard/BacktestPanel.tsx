'use client'

import React from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import {
  BacktestResponse,
  BacktestCoverage,
  BacktestCurvePoint,
  BatteryAsset,
  BackendBacktestEconomicResult,
  BackendBacktestRealizedWindow,
  RiskAppetite
} from '@/types/api'
import {
  ConfidenceBadge,
  DecisionBadge,
  EmptyState,
  MetricCard,
  SectionPanel,
  StatusBadge
} from '@/components/ui'
import { OptimizerBadge } from './OptimizerBadge'
import { PerformancePnLPanel } from './PerformancePnLPanel'

interface BacktestPanelProps {
  date: string
  onDateChange: (date: string) => void
  profile: RiskAppetite
  onProfileChange: (profile: RiskAppetite) => void
  onRunBacktest: () => void
  isRunning: boolean
  result: BacktestResponse | null
  assets?: BatteryAsset[]
  coverage?: BacktestCoverage | null
}

function formatEuro(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(value)
}

function formatEuroRange(range?: number[] | [number, number]): string {
  if (!range || range.length < 2) return 'Unavailable'
  return `${formatEuro(range[0])}-${formatEuro(range[1])}`
}

function formatPrice(value: number): string {
  return `${value.toFixed(1)} EUR/MWh`
}

function formatSpread(value: number): string {
  return formatPrice(value)
}

function formatSignedEuro(value: number): string {
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${formatEuro(value)}`
}

function formatSignedPrice(value: number): string {
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${formatPrice(value)}`
}

function humanize(value: string): string {
  if (value === 'day_ahead_lightgbm') return 'Day-Ahead LightGBM'
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function hasMissingHistoricalData(result: BacktestResponse | null): boolean {
  if (!result) return false

  const hasMissingDataWarning = result.warnings.some((warning) => {
    const normalized = warning.toLowerCase()
    return (
      normalized.includes('historical') ||
      normalized.includes('csv') ||
      normalized.includes('market_prices') ||
      normalized.includes('market price data') ||
      normalized.includes('unavailable') ||
      normalized.includes('no data')
    )
  })

  return hasMissingDataWarning || (result.economic_result === null && result.warnings.length > 0 && hasMissingDataWarning)
}

function windowDifference(window: BackendBacktestRealizedWindow): number {
  return window.realized_avg_price - window.forecast_avg_price
}

function realizedValue(result: BacktestResponse): number {
  return result.economic_result?.realized_value_eur ?? result.realized_value_eur ?? 0
}

function valueError(result: BacktestResponse): number {
  return result.economic_result?.value_error_eur ?? 0
}

function MissingHistoricalDataState() {
  return (
    <div className="border border-warning/40 bg-warning/10 p-4">
      <StatusBadge label="Real backtesting disabled" tone="warning" dot />
      <EmptyState
        title="Historical data unavailable"
        message="Add market_prices.csv to enable real backtesting."
        className="mt-3 border-warning/30 bg-surface/70 py-6"
      />
      <div className="mt-4 space-y-3 text-sm text-text-secondary">
        <p>
          The backtest backend needs 96 interval rows for the selected date.
        </p>
        <p>Real backtesting is disabled until historical price data is provided.</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <MissingDataNote label="Expected columns" value="date, interval_index, price" />
          <MissingDataNote label="Optional columns" value="timestamp, temperature" />
          <MissingDataNote label="Example path" value="data/market_prices.csv" />
        </div>
        <p className="text-xs text-text-muted">
          Create battery-analyst-console/data/market_prices.csv with 96 rows per date.
        </p>
      </div>
    </div>
  )
}

function MissingDataNote({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-surface px-3 py-2">
      <p className="text-xs uppercase tracking-wider text-text-muted">{label}</p>
      <code className="mt-1 block text-xs text-text-primary">{value}</code>
    </div>
  )
}

export function BacktestPanel({
  date,
  onDateChange,
  profile,
  onProfileChange,
  onRunBacktest,
  isRunning,
  result,
  assets = [],
  coverage = null
}: BacktestPanelProps) {
  const missingData = hasMissingHistoricalData(result)
  const economic = result?.economic_result ?? null
  const isHold = result?.decision === 'hold'

  return (
    <div className="space-y-6">
      <SectionPanel title="Backtest Controls" subtitle="Select a historical date and operating profile.">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-2 block text-xs uppercase tracking-wider text-text-secondary">Historical date</label>
            <input
              type="date"
              value={date}
              min={coverage?.earliest_date ?? undefined}
              max={coverage?.latest_date ?? undefined}
              onChange={(event) => onDateChange(event.target.value)}
              className="border border-border bg-surface px-3 py-2 text-sm text-text-primary"
            />
            {coverage?.earliest_date && coverage.latest_date && (
              <p className="mt-2 max-w-xs text-xs leading-relaxed text-text-muted">
                Available realized prices: {coverage.earliest_date} to {coverage.latest_date}
                {' '}({humanize(coverage.source)}).
              </p>
            )}
          </div>
          <div>
            <label className="mb-2 block text-xs uppercase tracking-wider text-text-secondary">Battery profile</label>
            <select
              value={profile}
              onChange={(event) => onProfileChange(event.target.value as RiskAppetite)}
              className="border border-border bg-surface px-3 py-2 text-sm text-text-primary"
            >
              <option value="conservative">Conservative</option>
              <option value="balanced">Balanced</option>
              <option value="aggressive">Aggressive</option>
            </select>
          </div>
          <button
            onClick={onRunBacktest}
            disabled={isRunning}
            className={`border px-5 py-2 text-sm font-medium transition ${
              isRunning
                ? 'cursor-not-allowed border-border bg-surface-elevated text-text-muted'
                : 'border-info bg-info text-white hover:bg-info/80'
            }`}
          >
            {isRunning ? 'Running backtest...' : 'Run backtest'}
          </button>
        </div>
      </SectionPanel>

      <SectionPanel
        title="Backtest Result"
        subtitle="Forecast recommendation compared against realized historical prices."
      >
        {!result ? (
          <EmptyState
            title="Ready for historical replay"
            message="Select a historical date and run a backtest to compare forecasted and realized economics."
          />
        ) : (
          <div className="space-y-6">
            {missingData && (
              <MissingHistoricalDataState />
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
              <MetricCard
                label="Decision"
                value={<DecisionBadge decision={result.decision} size="md" />}
                helperText={result.profile_name}
              />
              <MetricCard
                label="Confidence"
                value={<ConfidenceBadge confidence={result.confidence} size="md" />}
                helperText={result.date}
              />
              <MetricCard
                label="Forecast method"
                value={humanize(result.forecast_method)}
                helperText="Method used to build the forecast baseline."
              />
              <MetricCard
                label="Realized value"
                value={formatEuro(realizedValue(result))}
                tone={realizedValue(result) >= 0 ? 'positive' : 'warning'}
                helperText={isHold ? 'No dispatch executed.' : 'Historical dispatch value.'}
              />
              <MetricCard
                label="Value error"
                value={formatSignedEuro(valueError(result))}
                tone={valueError(result) >= 0 ? 'positive' : 'warning'}
                helperText="Realized value minus forecast midpoint."
              />
            </div>

            {isHold && (
              <div className="border border-border bg-surface p-4">
                <p className="text-sm font-semibold text-text-primary">
                  Scheduler returned hold, so no realized trade value was calculated.
                </p>
                <p className="mt-2 text-sm text-text-secondary">
                  This is a valid backtest outcome when the forecasted spread does not justify an executable schedule.
                </p>
              </div>
            )}

            {result.schedule_response?.optimizer && (
              <div className="border border-border bg-surface p-4">
                <p className="mb-3 text-xs uppercase tracking-wider text-text-secondary">Optimizer context</p>
                <OptimizerBadge optimizer={result.schedule_response.optimizer} />
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <WindowComparison label="Charge price comparison" window={result.charge_window} type="charge" />
              <WindowComparison label="Discharge price comparison" window={result.discharge_window} type="discharge" />
            </div>

            <BacktestCurveChart
              curve={result.curve}
              chargeWindow={result.charge_window ?? undefined}
              dischargeWindow={result.discharge_window ?? undefined}
            />

            <PerformancePnLPanel result={result} />

            <EconomicResult result={economic} isHold={isHold} />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <BacktestWarnings warnings={result.warnings} missingData={missingData} />
              <BacktestExplanation explanation={result.explanation} />
            </div>

            {assets.length > 0 && (
              <div className="border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wider text-text-secondary">Fleet context</p>
                <p className="mt-2 text-sm text-text-primary">
                  Backtest result is being reviewed against {assets.length} configured battery assets.
                </p>
              </div>
            )}
          </div>
        )}
      </SectionPanel>
    </div>
  )
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Athens'
  })
}

function timestampForWindow(curve: BacktestCurvePoint[], time: string): string {
  const date = curve[0]?.timestamp.slice(0, 10) ?? '2026-04-29'
  return `${date}T${time}:00+03:00`
}

function BacktestCurveChart({
  curve,
  chargeWindow,
  dischargeWindow
}: {
  curve: BacktestCurvePoint[]
  chargeWindow?: { start: string; end: string } | null
  dischargeWindow?: { start: string; end: string } | null
}) {
  if (curve.length === 0) {
    return (
      <div className="border border-border bg-surface p-4">
        <p className="text-xs uppercase tracking-wider text-text-secondary">Day-ahead curve</p>
        <p className="mt-3 text-sm text-text-secondary">No forecast curve was returned for this backtest.</p>
      </div>
    )
  }

  const chartData = curve.filter((point) => {
    const hour = new Date(point.timestamp).getHours()
    return hour >= 5 && hour <= 23
  }).map((point) => ({
    ...point,
    forecast_band: point.lower_bound != null && point.upper_bound != null
      ? [point.lower_bound, point.upper_bound] as [number, number]
      : undefined
  }))
  const chargeStart = chargeWindow ? timestampForWindow(curve, chargeWindow.start) : null
  const chargeEnd = chargeWindow ? timestampForWindow(curve, chargeWindow.end) : null
  const dischargeStart = dischargeWindow ? timestampForWindow(curve, dischargeWindow.start) : null
  const dischargeEnd = dischargeWindow ? timestampForWindow(curve, dischargeWindow.end) : null

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: BacktestCurvePoint }> }) => {
    if (!active || !payload?.length) return null
    const point = payload[0].payload

    return (
      <div className="rounded-lg border border-border bg-surface-elevated p-3 shadow-lg">
        <p className="mb-1 text-xs text-text-secondary">{formatTime(point.timestamp)}</p>
        <p className="text-sm text-text-primary">Forecast: <span className="font-semibold">{point.forecast_price.toFixed(1)} EUR/MWh</span></p>
        <p className="text-sm text-text-primary">Realized MCP: <span className="font-semibold">{point.realized_price.toFixed(1)} EUR/MWh</span></p>
        {point.lower_bound != null && point.upper_bound != null && (
          <p className="text-xs text-text-muted">Forecast band: {point.lower_bound.toFixed(1)}-{point.upper_bound.toFixed(1)} EUR/MWh</p>
        )}
      </div>
    )
  }

  return (
    <div className="border border-border bg-surface p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-text-secondary">Day-ahead curve</p>
          <p className="mt-1 text-sm text-text-muted">LightGBM forecast replay compared with realized HENEX MCP.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <StatusBadge label="Forecast" tone="info" dot />
          <StatusBadge label="Forecast band" tone="neutral" dot />
          <StatusBadge label="Realized MCP" tone="neutral" dot />
        </div>
      </div>
      <div className="mt-4 h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 16, right: 24, left: 16, bottom: 16 }}>
            <defs>
              <linearGradient id="backtestBandGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#a1a1aa" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#a1a1aa" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" vertical={false} />
            <XAxis
              dataKey="timestamp"
              tickFormatter={formatTime}
              stroke="#686878"
              tick={{ fill: '#9898a8', fontSize: 11 }}
              axisLine={{ stroke: '#2a2a3a' }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              stroke="#686878"
              tick={{ fill: '#9898a8', fontSize: 11 }}
              axisLine={{ stroke: '#2a2a3a' }}
              tickLine={false}
              label={{
                value: 'EUR/MWh',
                angle: -90,
                position: 'insideLeft',
                style: { fill: '#686878', fontSize: 12 }
              }}
            />
            <Tooltip content={<CustomTooltip />} />
            {chargeStart && chargeEnd && (
              <ReferenceArea x1={chargeStart} x2={chargeEnd} strokeOpacity={0} fill="#3b82f6" fillOpacity={0.12} />
            )}
            {dischargeStart && dischargeEnd && (
              <ReferenceArea x1={dischargeStart} x2={dischargeEnd} strokeOpacity={0} fill="#f59e0b" fillOpacity={0.12} />
            )}
            <Area
              type="monotone"
              dataKey="forecast_band"
              stroke="transparent"
              fill="url(#backtestBandGradient)"
              fillOpacity={1}
              dot={false}
              activeDot={false}
              connectNulls={false}
            />
            <Line type="monotone" dataKey="forecast_price" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="realized_price" stroke="#e8e8ed" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function WindowComparison({
  label,
  window,
  type
}: {
  label: string
  window: BackendBacktestRealizedWindow | null
  type: 'charge' | 'discharge'
}) {
  if (!window) {
    return (
      <div className="border border-border bg-surface p-4">
        <p className="text-xs uppercase tracking-wider text-text-secondary">{label}</p>
        <p className="mt-3 text-sm font-semibold text-text-primary">
          No {type} window was executed.
        </p>
        <p className="mt-1 text-sm text-text-secondary">
          The backtest response did not include a realized {type} interval.
        </p>
      </div>
    )
  }

  const difference = windowDifference(window)

  return (
    <div className="border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-text-secondary">{label}</p>
          <p className="mt-2 text-lg font-semibold text-text-primary">
            {window.start}-{window.end}
          </p>
        </div>
        <StatusBadge
          label={formatSignedPrice(difference)}
          tone={difference <= 0 && type === 'charge' ? 'positive' : difference >= 0 && type === 'discharge' ? 'positive' : 'warning'}
        />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ComparisonValue label="Forecast" value={formatPrice(window.forecast_avg_price)} />
        <ComparisonValue label="Realized" value={formatPrice(window.realized_avg_price)} />
        <ComparisonValue label="Difference" value={formatSignedPrice(difference)} />
      </div>
    </div>
  )
}

function ComparisonValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-surface-elevated/40 p-3">
      <p className="text-xs uppercase tracking-wider text-text-muted">{label}</p>
      <p className="mt-2 text-sm font-semibold text-text-primary">{value}</p>
    </div>
  )
}

function EconomicResult({
  result,
  isHold
}: {
  result: BackendBacktestEconomicResult | null
  isHold: boolean
}) {
  if (!result) {
    return (
      <div className="border border-border bg-surface p-4">
        <p className="text-xs uppercase tracking-wider text-text-secondary">Economic result</p>
        <p className="mt-3 text-sm font-semibold text-text-primary">No realized trade value was calculated.</p>
        {isHold && (
          <p className="mt-1 text-sm text-text-secondary">
            Scheduler returned hold, so forecast and realized execution economics are not available.
          </p>
        )}
      </div>
    )
  }

  const spreadDifference = result.realized_spread_after_efficiency - result.forecast_spread_after_efficiency

  return (
    <div className="border border-border bg-surface p-4">
      <p className="text-xs uppercase tracking-wider text-text-secondary">Economic result</p>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        <MetricCard
          label="Forecast spread"
          value={formatSpread(result.forecast_spread_after_efficiency)}
          className="bg-surface"
        />
        <MetricCard
          label="Realized spread"
          value={formatSpread(result.realized_spread_after_efficiency)}
          className="bg-surface"
        />
        <MetricCard
          label="Spread error"
          value={formatSignedPrice(spreadDifference)}
          tone={spreadDifference >= 0 ? 'positive' : 'warning'}
          className="bg-surface"
        />
        <MetricCard
          label="Expected value"
          value={formatEuroRange(result.forecast_expected_value_range_eur)}
          className="bg-surface"
        />
        <MetricCard
          label="Realized value"
          value={formatEuro(result.realized_value_eur)}
          trend={formatSignedEuro(result.value_error_eur)}
          tone={result.value_error_eur >= 0 ? 'positive' : 'warning'}
          className="bg-surface"
        />
      </div>
    </div>
  )
}

function BacktestWarnings({
  warnings,
  missingData
}: {
  warnings: string[]
  missingData: boolean
}) {
  return (
    <div className="border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-wider text-text-secondary">Warnings</p>
        <StatusBadge
          label={warnings.length > 0 ? `${warnings.length} warning${warnings.length === 1 ? '' : 's'}` : 'No warnings'}
          tone={warnings.length > 0 ? 'warning' : 'positive'}
          dot
        />
      </div>
      {warnings.length > 0 ? (
        <ul className="mt-4 space-y-2 text-sm text-text-secondary">
          {warnings.map((warning) => (
            <li key={warning} className="border-l-2 border-warning/50 pl-3">
              {warning}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-text-secondary">No backtest warnings.</p>
      )}
      {missingData && (
        <p className="mt-3 text-xs text-text-muted">
          Real historical validation requires local market_prices.csv coverage for the selected date.
        </p>
      )}
    </div>
  )
}

function BacktestExplanation({ explanation }: { explanation: string[] }) {
  const visibleExplanation = explanation.slice(0, 5)
  const hiddenCount = Math.max(explanation.length - visibleExplanation.length, 0)

  return (
    <div className="border border-border bg-surface p-4">
      <p className="text-xs uppercase tracking-wider text-text-secondary">Explanation</p>
      {visibleExplanation.length > 0 ? (
        <>
          <ul className="mt-4 space-y-2 text-sm text-text-secondary">
            {visibleExplanation.map((item) => (
              <li key={item} className="border-l-2 border-info/40 pl-3">
                {item}
              </li>
            ))}
          </ul>
          {hiddenCount > 0 && (
            <p className="mt-3 text-xs text-text-muted">
              {hiddenCount} additional explanation point{hiddenCount === 1 ? '' : 's'} returned.
            </p>
          )}
        </>
      ) : (
        <p className="mt-4 text-sm text-text-secondary">No backtest explanation returned.</p>
      )}
    </div>
  )
}
