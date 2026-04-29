'use client'

import React from 'react'
import { BacktestResponse, BatteryAsset, RiskAppetite } from '@/types/api'
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
  assets?: BatteryAsset[]
}

function formatDecision(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function BacktestPanel({ date, onDateChange, profile, onProfileChange, onRunBacktest, isRunning, result, assets = [] }: BacktestPanelProps) {
  const assetDistribution = {
    charge: assets.filter((asset) => asset.auto_action === 'charge').length,
    discharge: assets.filter((asset) => asset.auto_action === 'discharge').length,
    idle: assets.filter((asset) => asset.auto_action === 'idle').length
  }
  const expectedValue = result?.expected_value_eur ?? 0
  const realizedValue = result?.realized_value_eur ?? 0
  const actualSpread = result?.actual_spread ?? 0
  const recommendationQuality = result?.recommendation_quality ?? 'fair'
  const explanation = Array.isArray(result?.explanation) ? result.explanation.join(' ') : ''
  const forecastPoints = result?.forecast_points ?? []

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
            <MetricCard label="Expected Value" value={`€${expectedValue}`} size="sm" />
            <MetricCard label="Realized Value" value={`€${realizedValue}`} variant={realizedValue >= expectedValue * 0.8 ? 'success' : 'warning'} size="sm" />
            <MetricCard label="Actual Spread" value={actualSpread.toFixed(1)} unit="€/MWh" size="sm" />
          </div>

          <div className="rounded-lg border border-border bg-surface-elevated/50 p-4">
            <h3 className="mb-3 text-xs uppercase tracking-wider text-text-secondary">Fleet Backtest Summary</h3>
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
              <SummaryItem label="Batteries Simulated" value={assets.length || 8} />
              <SummaryItem label="Charge" value={assetDistribution.charge || 4} />
              <SummaryItem label="Discharge" value={assetDistribution.discharge || 2} />
              <SummaryItem label="Idle" value={assetDistribution.idle || 2} />
              <SummaryItem label="Fleet Realized Value" value={`€${realizedValue}`} />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface-elevated/50 p-4">
            <h3 className="mb-4 text-xs uppercase tracking-wider text-text-secondary">Actual vs Forecast</h3>
            <ForecastChart data={forecastPoints} chargeWindow={result.charge_window ?? undefined} dischargeWindow={result.discharge_window ?? undefined} />
          </div>

          {assets.length > 0 && (
            <div className="rounded-lg border border-border bg-surface-elevated/50 p-4">
              <h3 className="mb-3 text-xs uppercase tracking-wider text-text-secondary">Asset-Level Outcome</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wider text-text-muted">
                    <tr>
                      <th className="py-2 pr-3">Battery</th>
                      <th className="py-2 pr-3">Site</th>
                      <th className="py-2 pr-3">Recommended</th>
                      <th className="py-2 pr-3">SoC</th>
                      <th className="py-2 pr-3">Stress</th>
                      <th className="py-2 pr-3">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {assets.map((asset) => (
                      <tr key={asset.id}>
                        <td className="py-2 pr-3 text-text-primary">{asset.name}</td>
                        <td className="py-2 pr-3 text-text-secondary">{asset.site}</td>
                        <td className="py-2 pr-3 text-text-primary">{asset.auto_action}</td>
                        <td className="py-2 pr-3 text-text-primary">{Math.round(asset.soc * 100)}%</td>
                        <td className="py-2 pr-3 text-text-primary">{asset.stress_level}</td>
                        <td className="py-2 pr-3 text-text-primary">€{asset.expected_value_eur[0]}-€{asset.expected_value_eur[1]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface-elevated/50 p-4">
              <h3 className="mb-3 text-xs uppercase tracking-wider text-text-secondary">Recommended Windows</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-text-muted">Charge Window</p>
                  <p className="text-text-primary">{result.charge_window ? `${result.charge_window.start}-${result.charge_window.end}` : 'No trade'}</p>
                  <p className="text-xs text-text-muted">@ {result.charge_window?.realized_avg_price ?? 0} €/MWh realized</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Discharge Window</p>
                  <p className="text-text-primary">{result.discharge_window ? `${result.discharge_window.start}-${result.discharge_window.end}` : 'No trade'}</p>
                  <p className="text-xs text-text-muted">@ {result.discharge_window?.realized_avg_price ?? 0} €/MWh realized</p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-surface-elevated/50 p-4">
              <h3 className="mb-3 text-xs uppercase tracking-wider text-text-secondary">Recommendation Quality</h3>
              <span className="mb-3 inline-block rounded bg-success/10 px-3 py-1 text-sm font-medium text-success">
                {formatDecision(recommendationQuality)}
              </span>
              <p className="text-sm leading-relaxed text-text-secondary">{explanation}</p>
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

function SummaryItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-text-primary">{value}</p>
    </div>
  )
}
