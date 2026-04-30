'use client'

import React from 'react'
import { ForecastPoint, ScheduleResponse, Window } from '@/types/api'
import { ConfidenceBadge, MetricCard, SectionPanel, StatusBadge } from '@/components/ui'
import { ForecastChart } from './ForecastChart'

interface MarketForecastSectionProps {
  forecastData: ForecastPoint[]
  schedule: ScheduleResponse
}

function formatEuro(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
    style: 'currency',
    currency: 'EUR'
  }).format(value)
}

function formatEuroRange(range: [number, number] | number[]): string {
  const low = range[0] ?? 0
  const high = range[1] ?? low
  return `${formatEuro(low)}-${formatEuro(high)}`
}

function formatSpread(value: number): string {
  return `${value.toFixed(1)} EUR/MWh`
}

function formatPrice(value: number): string {
  return `${value.toFixed(1)} EUR/MWh`
}

function isExecutableWindow(window: Window | null | undefined): window is Window {
  return Boolean(window && window.start !== window.end && window.start !== '00:00' && window.end !== '00:00')
}

type MarketSignal = 'charge' | 'discharge' | 'idle' | 'mixed'

function signalTone(signal: MarketSignal): 'positive' | 'warning' | 'info' | 'neutral' {
  if (signal === 'charge') return 'positive'
  if (signal === 'discharge') return 'info'
  if (signal === 'mixed') return 'warning'
  return 'neutral'
}

function signalLabel(signal: MarketSignal): string {
  return signal.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function decisionLabel(schedule: ScheduleResponse): string {
  if (schedule.decision === 'execute') return 'Charge'
  if (schedule.decision === 'execute_with_caution') return 'Charge with caution'
  if (schedule.decision === 'watch') return 'Watch'
  return 'Hold'
}

function decisionTone(schedule: ScheduleResponse): 'positive' | 'warning' | 'info' | 'critical' {
  if (schedule.decision === 'execute') return 'positive'
  if (schedule.decision === 'execute_with_caution') return 'warning'
  if (schedule.decision === 'watch') return 'info'
  return 'critical'
}

function signalFromSchedule(schedule: ScheduleResponse, hasTradeWindows: boolean): MarketSignal {
  if (schedule.decision === 'hold' || !hasTradeWindows) return 'idle'
  if (schedule.decision === 'execute' || schedule.decision === 'execute_with_caution') return 'charge'
  return 'mixed'
}

function operatingReason(schedule: ScheduleResponse, hasTradeWindows: boolean): string {
  if (hasTradeWindows) {
    return `Charge during ${schedule.charge_window.start}-${schedule.charge_window.end}, then discharge during ${schedule.discharge_window.start}-${schedule.discharge_window.end} if asset constraints remain acceptable.`
  }

  return schedule.explanation[0] ?? schedule.alerts[0]?.message ?? 'No executable charge/discharge window is currently recommended.'
}

function WindowSummary({ label, window, tone }: { label: string; window: Window; tone: 'positive' | 'info' }) {
  const executable = isExecutableWindow(window)

  return (
    <div className="border border-border bg-surface px-3 py-2">
      <p className="text-xs uppercase tracking-wider text-text-muted">{label}</p>
      {executable ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-text-primary">{window.start}-{window.end}</span>
          <StatusBadge label={formatPrice(window.avg_price)} tone={tone} />
        </div>
      ) : (
        <p className="mt-1 text-sm text-text-secondary">No executable window</p>
      )}
    </div>
  )
}

function LegendItem({ label, className }: { label: string; className: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-4 ${className}`} />
      {label}
    </span>
  )
}

function topDriverSlots(points: ForecastPoint[]): ForecastPoint[] {
  return [...points]
    .filter((point) => point.shap_explanation?.top_contributions?.length)
    .sort((left, right) => right.p50_price - left.p50_price)
    .slice(0, 3)
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Athens'
  })
}

export function MarketForecastSection({ forecastData, schedule }: MarketForecastSectionProps) {
  const hasChargeWindow = isExecutableWindow(schedule.charge_window)
  const hasDischargeWindow = isExecutableWindow(schedule.discharge_window)
  const hasTradeWindows = hasChargeWindow && hasDischargeWindow
  const currentSignal = signalFromSchedule(schedule, hasTradeWindows)
  const driverSlots = topDriverSlots(forecastData)

  return (
    <SectionPanel
      title="Market Forecast"
      subtitle="96-interval day-ahead price signal with recommended charge and discharge windows."
      action={<StatusBadge label="Resolution: 15 minutes · Horizon: 24 hours" tone="neutral" />}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          <MetricCard label="Decision" value={<StatusBadge label={decisionLabel(schedule)} tone={decisionTone(schedule)} size="md" dot />} />
          <MetricCard label="Confidence" value={<ConfidenceBadge confidence={schedule.confidence} size="md" />} />
          <MetricCard label="Spread after efficiency" value={formatSpread(schedule.spread_after_efficiency)} tone="info" />
          <MetricCard label="Expected value" value={formatEuroRange(schedule.expected_value_range_eur)} tone="positive" />
          <MetricCard label="Market signal" value={signalLabel(currentSignal)} tone={signalTone(currentSignal)} />
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <WindowSummary label="Charge window" window={schedule.charge_window} tone="positive" />
          <WindowSummary label="Discharge window" window={schedule.discharge_window} tone="info" />
        </div>

        {!hasTradeWindows && (
          <div className="border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-text-primary">
            No executable charge/discharge window. <span className="text-text-secondary">{operatingReason(schedule, false)}</span>
          </div>
        )}

        <div className="border border-border bg-surface p-4">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Day-ahead price curve</h3>
              <p className="mt-1 text-xs text-text-secondary">96 x 15-min intervals across the operating day.</p>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-text-muted">
              <LegendItem label="Forecast price" className="bg-info" />
              <LegendItem label="Charge dispatch" className="bg-charge" />
              <LegendItem label="Discharge dispatch" className="bg-discharge" />
              <LegendItem label="SoC trajectory" className="bg-discharge" />
              <LegendItem label="No-action / idle" className="bg-text-muted" />
            </div>
          </div>
          <ForecastChart
            data={forecastData}
            chargeWindow={hasChargeWindow ? schedule.charge_window : undefined}
            dischargeWindow={hasDischargeWindow ? schedule.discharge_window : undefined}
            schedule={schedule}
          />
        </div>

        <div className="border border-border bg-surface px-3 py-2">
          <p className="text-xs uppercase tracking-wider text-text-muted">Operating rationale</p>
          <p className="mt-1 text-sm leading-relaxed text-text-primary">{operatingReason(schedule, hasTradeWindows)}</p>
        </div>

        {driverSlots.length > 0 && (
          <div className="border border-border bg-surface px-3 py-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-text-muted">Forecast drivers from SHAP</p>
                <p className="mt-1 text-sm text-text-secondary">
                  Top LightGBM feature contributions for the highest-price forecast slots.
                </p>
              </div>
              <StatusBadge
                label={driverSlots[0]?.shap_explanation?.source === 'historical_shap_slot_proxy' ? 'Historical slot proxy' : 'Historical SHAP'}
                tone="info"
              />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
              {driverSlots.map((point) => (
                <div key={point.timestamp} className="border border-border bg-surface-elevated/50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">{formatTime(point.timestamp)}</p>
                      <p className="text-xs text-text-muted">{point.p50_price.toFixed(1)} EUR/MWh forecast</p>
                    </div>
                    <StatusBadge label={point.confidence ?? 'confidence'} tone="neutral" />
                  </div>
                  <ul className="mt-3 space-y-2">
                    {point.shap_explanation?.top_contributions.slice(0, 3).map((driver) => (
                      <li key={`${point.timestamp}-${driver.feature}`} className="flex items-center justify-between gap-3 text-xs">
                        <span className="truncate text-text-secondary">{driver.feature}</span>
                        <span className={driver.direction === 'up' ? 'font-mono text-success' : 'font-mono text-error'}>
                          {driver.contribution_eur_per_mwh > 0 ? '+' : ''}{driver.contribution_eur_per_mwh.toFixed(2)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </SectionPanel>
  )
}
