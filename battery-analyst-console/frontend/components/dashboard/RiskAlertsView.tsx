'use client'

import React from 'react'
import { Alert, BatteryAsset, BacktestResponse, ForecastPoint, ScheduleResponse } from '@/types/api'
import { EmptyState, MetricCard, SectionPanel, StatusBadge } from '@/components/ui'
import { AlertCard } from './AlertCard'
import { FleetAlertsPanel } from './FleetAlertsPanel'

interface RiskAlertsViewProps {
  alerts: Alert[]
  assets: BatteryAsset[]
  schedule: ScheduleResponse | null
  forecastData: ForecastPoint[]
  backtestResult: BacktestResponse | null
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatSignedPercent(value: number): string {
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${Math.round(value * 100)}%`
}

function buildSyntheticHealthScore(assets: BatteryAsset[], schedule: ScheduleResponse | null): number {
  const averageSoc = average(assets.map((asset) => asset.soc))
  const temperaturePenalty = average(assets.map((asset) => Math.max(0, asset.temperature_c - 28))) * 2.5
  const stressPenalty = schedule?.battery_stress.score ? schedule.battery_stress.score * 0.18 : 8
  const socPenalty = Math.abs(averageSoc - 0.55) * 35
  return Math.max(0, Math.min(100, Math.round(94 - temperaturePenalty - stressPenalty - socPenalty)))
}

function syntheticEffectiveRte(schedule: ScheduleResponse | null, backtestResult: BacktestResponse | null): number {
  const baseline = 0.85
  const drift = backtestResult?.economic_result
    ? Math.max(-0.04, Math.min(0.04, backtestResult.economic_result.value_error_eur / 100000))
    : -0.018
  const stressAdjustment = schedule?.battery_stress.level === 'high' ? -0.025 : schedule?.battery_stress.level === 'medium' ? -0.01 : 0
  return Math.max(0.7, Math.min(0.92, baseline + drift + stressAdjustment))
}

function forecastBias(forecastData: ForecastPoint[], backtestResult: BacktestResponse | null): number {
  if (backtestResult?.curve?.length) {
    return average(backtestResult.curve.map((point) => point.realized_price - point.forecast_price))
  }
  return average(forecastData.map((point) => point.p90_price - point.p10_price)) / 12
}

function buildModelAlerts(
  schedule: ScheduleResponse | null,
  forecastData: ForecastPoint[],
  backtestResult: BacktestResponse | null,
  effectiveRte: number,
  bias: number
): Alert[] {
  const alerts: Alert[] = []
  const uncertainty = average(forecastData.map((point) => Math.max(0, point.p90_price - point.p10_price)))

  if (uncertainty > 50) {
    alerts.push({
      severity: 'warning',
      title: 'Forecast uncertainty alert',
      message: `Average P90-P10 spread is ${uncertainty.toFixed(1)} EUR/MWh.`,
      recommended_action: 'Review the schedule manually before dispatch.'
    })
  }
  if (schedule?.decision === 'hold') {
    alerts.push({
      severity: 'info',
      title: 'No-go day alert',
      message: 'MILP chose idle or no executable trade because expected spread did not justify cycling.',
      recommended_action: 'Wait for a stronger spread or test assumptions in Scenario Analyst.'
    })
  }
  if (effectiveRte < 0.82) {
    alerts.push({
      severity: 'warning',
      title: 'Performance drift alert',
      message: `Synthetic effective RTE is ${formatPercent(effectiveRte)}, below the expected 85% baseline.`,
      recommended_action: 'Inspect battery telemetry and compare commanded vs delivered energy.'
    })
  }
  if (Math.abs(bias) > 12) {
    alerts.push({
      severity: 'warning',
      title: 'Missed opportunity alert',
      message: `Recent realized-vs-forecast bias is ${bias.toFixed(1)} EUR/MWh.`,
      recommended_action: 'Investigate forecast misses around peak intervals.'
    })
  }
  if (backtestResult?.economic_result && Math.abs(backtestResult.economic_result.value_error_eur) > 5000) {
    alerts.push({
      severity: 'info',
      title: 'Market regime alert',
      message: 'Backtest value error is large enough to suggest the historical pattern may not hold.',
      recommended_action: 'Review gas, carbon, and demand drivers before relying on the next forecast.'
    })
  }
  return alerts
}

export function RiskAlertsView({
  alerts,
  assets,
  schedule,
  forecastData,
  backtestResult
}: RiskAlertsViewProps) {
  const healthScore = buildSyntheticHealthScore(assets, schedule)
  const effectiveRte = syntheticEffectiveRte(schedule, backtestResult)
  const bias = forecastBias(forecastData, backtestResult)
  const modelAlerts = buildModelAlerts(schedule, forecastData, backtestResult, effectiveRte, bias)
  const idleReasons = [
    schedule?.decision === 'hold'
      ? schedule.explanation[0] ?? 'MILP held because no executable spread cleared constraints.'
      : 'Latest schedule is executable; no idle day recorded for the active plan.',
    'Idle decisions are logged when spread, SoC, grid, or ramp constraints block profitable dispatch.',
  ]

  return (
    <div className="space-y-6">
      <SectionPanel title="Risk & Alerts" subtitle="Actionable model, market, and physical risk signals.">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Health score" value={healthScore} helperText="Synthetic telemetry capability demo" tone={healthScore >= 80 ? 'positive' : healthScore >= 65 ? 'warning' : 'critical'} />
          <MetricCard label="Effective RTE" value={formatPercent(effectiveRte)} helperText={`${formatSignedPercent(effectiveRte - 0.85)} vs 85% baseline`} tone={effectiveRte >= 0.83 ? 'positive' : 'warning'} />
          <MetricCard label="Forecast bias" value={`${bias.toFixed(1)} EUR/MWh`} helperText="Realized minus forecast proxy" tone={Math.abs(bias) <= 10 ? 'positive' : 'warning'} />
          <MetricCard label="Optimizer idle log" value={schedule?.decision === 'hold' ? 'Idle' : 'Active'} helperText={schedule?.date ?? 'No schedule'} tone={schedule?.decision === 'hold' ? 'info' : 'positive'} />
        </div>
      </SectionPanel>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <SectionPanel title="Model intelligence alerts" subtitle="Clickable diagnostics for forecast and performance risk.">
          {modelAlerts.length === 0 ? (
            <EmptyState title="No model alerts" message="Forecast uncertainty, effective RTE drift, and missed-opportunity checks are inside expected bounds." />
          ) : (
            <div className="space-y-3">
              {modelAlerts.map((alert, index) => (
                <details key={`${alert.title}-${index}`} className="border border-border bg-surface p-3">
                  <summary className="cursor-pointer text-sm font-medium text-text-primary">
                    {alert.title}
                  </summary>
                  <div className="mt-3">
                    <AlertCard alert={alert} />
                  </div>
                </details>
              ))}
            </div>
          )}
        </SectionPanel>

        <SectionPanel title="Battery health diagnostics" subtitle="Synthetic telemetry monitor for degradation signals.">
          <div className="space-y-3">
            <HealthRow label="Energy out / energy in" value={formatPercent(effectiveRte)} tone={effectiveRte >= 0.83 ? 'positive' : 'warning'} />
            <HealthRow label="Commanded vs delivered deviation" value={`${Math.max(1, Math.round((0.85 - effectiveRte) * 100))}%`} tone={effectiveRte >= 0.83 ? 'positive' : 'warning'} />
            <HealthRow label="SoC degradation trend" value={healthScore >= 80 ? 'Stable' : 'Watch'} tone={healthScore >= 80 ? 'positive' : 'warning'} />
            <p className="text-xs leading-relaxed text-text-muted">
              Telemetry is simulated with small noise and slow RTE drift until real battery measurements are connected.
            </p>
          </div>
        </SectionPanel>
      </div>

      <SectionPanel title="Days optimizer chose idle" subtitle="Recent idle reasoning log.">
        <div className="space-y-2">
          {idleReasons.map((reason, index) => (
            <div key={`${reason}-${index}`} className="border border-border bg-surface px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge label={index === 0 && schedule?.decision === 'hold' ? 'Idle' : 'Context'} tone={index === 0 && schedule?.decision === 'hold' ? 'info' : 'neutral'} />
                <p className="text-sm text-text-secondary">{reason}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionPanel>

      <FleetAlertsPanel alerts={alerts} assets={assets} />
    </div>
  )
}

function HealthRow({
  label,
  value,
  tone
}: {
  label: string
  value: string
  tone: 'positive' | 'warning'
}) {
  return (
    <div className="flex items-center justify-between border border-border bg-surface px-3 py-2">
      <span className="text-sm text-text-secondary">{label}</span>
      <StatusBadge label={value} tone={tone} />
    </div>
  )
}
