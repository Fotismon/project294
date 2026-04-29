'use client'

import React from 'react'
import { BacktestResponse, RiskAppetite } from '@/types/api'
import { ForecastChart } from './ForecastChart'
import { MetricCard } from './MetricCard'

interface BacktestPanelProps {
  date: string
  onDateChange: (date: string) => void
  profile: RiskAppetite
  onProfileChange: (profile: RiskAppetite) => void
  onRunBacktest: () => void
  isRunning: boolean
  result: BacktestResponse | null
}

function formatDecision(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function BacktestPanel({ date, onDateChange, profile, onProfileChange, onRunBacktest, isRunning, result }: BacktestPanelProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-surface-elevated/50 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-2 block text-xs text-text-secondary">Historical Date</label>
            <input
              type="date"
              value={date}
              onChange={(event) => onDateChange(event.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs text-text-secondary">Battery Profile</label>
            <select
              value={profile}
              onChange={(event) => onProfileChange(event.target.value as RiskAppetite)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
            >
              <option value="conservative">Conservative</option>
              <option value="balanced">Balanced</option>
              <option value="aggressive">Aggressive</option>
            </select>
          </div>
          <button
            onClick={onRunBacktest}
            disabled={isRunning}
            className={`rounded-lg px-6 py-2 text-sm font-medium transition ${
              isRunning ? 'cursor-not-allowed bg-surface-elevated text-text-muted' : 'bg-info text-white hover:bg-info/80'
            }`}
          >
            {isRunning ? 'Running...' : 'Run Backtest'}
          </button>
        </div>
      </div>

      {result ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricCard label="Historical Decision" value={formatDecision(result.decision)} variant={result.decision === 'execute' ? 'success' : 'warning'} size="sm" />
            <MetricCard label="Expected Value" value={`€${result.expected_value_eur}`} size="sm" />
            <MetricCard label="Realized Value" value={`€${result.realized_value_eur}`} variant={result.realized_value_eur >= result.expected_value_eur * 0.8 ? 'success' : 'warning'} size="sm" />
            <MetricCard label="Actual Spread" value={result.actual_spread.toFixed(1)} unit="€/MWh" size="sm" />
          </div>

          <div className="rounded-lg border border-border bg-surface-elevated/50 p-4">
            <h3 className="mb-4 text-xs uppercase tracking-wider text-text-secondary">Actual vs Forecast</h3>
            <ForecastChart data={result.forecast_points} chargeWindow={result.charge_window} dischargeWindow={result.discharge_window} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface-elevated/50 p-4">
              <h3 className="mb-3 text-xs uppercase tracking-wider text-text-secondary">Recommended Windows</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-text-muted">Charge Window</p>
                  <p className="text-text-primary">{result.charge_window.start}-{result.charge_window.end}</p>
                  <p className="text-xs text-text-muted">@ {result.charge_window.avg_price} €/MWh</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Discharge Window</p>
                  <p className="text-text-primary">{result.discharge_window.start}-{result.discharge_window.end}</p>
                  <p className="text-xs text-text-muted">@ {result.discharge_window.avg_price} €/MWh</p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-surface-elevated/50 p-4">
              <h3 className="mb-3 text-xs uppercase tracking-wider text-text-secondary">Recommendation Quality</h3>
              <span className="mb-3 inline-block rounded bg-success/10 px-3 py-1 text-sm font-medium text-success">
                {formatDecision(result.recommendation_quality)}
              </span>
              <p className="text-sm leading-relaxed text-text-secondary">{result.explanation}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-surface-elevated/50 p-8 text-center">
          <p className="text-text-muted">Select a historical date and profile, then run backtest.</p>
        </div>
      )}
    </div>
  )
}
