'use client'

import React from 'react'
import { Alert, ScheduleResponse } from '@/types/api'
import {
  ConfidenceBadge,
  DecisionBadge,
  MetricCard,
  SectionPanel,
  StatusBadge,
  StressBadge
} from '@/components/ui'

interface NoActionPanelProps {
  schedule: ScheduleResponse
  className?: string
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

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function physicalConstraintsHaveIssues(schedule: ScheduleResponse): boolean {
  const constraints = schedule.physical_constraints
  const required = [
    constraints.duration_ok,
    constraints.cycle_limit_ok,
    constraints.temperature_ok,
    constraints.round_trip_efficiency_applied,
    constraints.rapid_switching_avoided
  ]

  if (typeof constraints.soc_feasible === 'boolean') required.push(constraints.soc_feasible)
  return required.some((value) => !value)
}

function sortedAlerts(schedule: ScheduleResponse): Alert[] {
  const priority: Record<Alert['severity'], number> = {
    critical: 0,
    warning: 1,
    info: 2
  }

  return [...schedule.alerts].sort((left, right) => priority[left.severity] - priority[right.severity])
}

function firstUsefulReason(schedule: ScheduleResponse): string | null {
  const alertReason = sortedAlerts(schedule)[0]
  return (
    schedule.explanation[0] ??
    alertReason?.message ??
    schedule.soc_feasibility.violations[0] ??
    null
  )
}

function buildRiskBullets(schedule: ScheduleResponse): string[] {
  const warningAlerts = schedule.alerts.filter((alert) => alert.severity === 'critical' || alert.severity === 'warning')
  const bullets = [
    `Battery stress is ${schedule.battery_stress.level} with score ${schedule.battery_stress.score}.`,
    schedule.soc_feasibility.feasible
      ? `SoC feasibility passed from ${formatPercent(schedule.soc_feasibility.start_soc)} to ${formatPercent(schedule.soc_feasibility.end_soc)}, but economics still do not justify dispatch.`
      : `SoC feasibility has ${schedule.soc_feasibility.violations.length} violation(s).`,
    physicalConstraintsHaveIssues(schedule)
      ? 'Physical constraints require review.'
      : 'Physical constraints do not block the hold recommendation.',
    warningAlerts.length > 0
      ? 'Critical or warning alerts are active.'
      : 'No critical or warning alerts are active.'
  ]

  return bullets
}

function buildHoldReasons(schedule: ScheduleResponse): string[] {
  const alertReasons = sortedAlerts(schedule)
    .filter((alert) => alert.severity !== 'info')
    .map((alert) => `${alert.title}: ${alert.message}`)
  const reasons = [
    ...schedule.explanation,
    ...schedule.soc_feasibility.violations,
    ...alertReasons
  ]

  return Array.from(new Set(reasons)).slice(0, 6)
}

function alertTone(alert: Alert): 'critical' | 'warning' | 'info' {
  return alert.severity === 'critical' ? 'critical' : alert.severity === 'warning' ? 'warning' : 'info'
}

export function NoActionPanel({ schedule, className = '' }: NoActionPanelProps) {
  const isHold = schedule.decision === 'hold'
  const title = isHold ? 'No action recommended' : 'No-action review'
  const usefulReason = firstUsefulReason(schedule)
  const riskBullets = buildRiskBullets(schedule)
  const holdReasons = buildHoldReasons(schedule)
  const activeAlerts = sortedAlerts(schedule).slice(0, 3)
  const expectedValueIsZero = schedule.expected_value_range_eur[0] === 0 && schedule.expected_value_range_eur[1] === 0

  return (
    <SectionPanel
      title={title}
      subtitle="Current market and battery conditions do not justify dispatch."
      className={className}
    >
      <div className="space-y-5">
        <div className="border border-warning/30 bg-warning/10 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <DecisionBadge decision={schedule.decision} size="md" />
            <ConfidenceBadge confidence={schedule.confidence} size="md" />
            <StressBadge level={schedule.battery_stress.level} score={schedule.battery_stress.score} size="md" />
          </div>

          {!isHold && (
            <p className="mt-3 text-sm text-text-secondary">
              This panel is normally used for hold recommendations.
            </p>
          )}

          <h3 className="mt-4 text-xl font-semibold text-text-primary">
            Forecasted spread does not compensate for round-trip efficiency losses and degradation risk.
          </h3>
          {usefulReason && <p className="mt-2 text-sm leading-relaxed text-text-secondary">{usefulReason}</p>}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <MetricCard label="Spread after efficiency" value={formatSpread(schedule.spread_after_efficiency)} tone="warning" />
          <MetricCard
            label="Expected value"
            value={formatEuroRange(schedule.expected_value_range_eur)}
            tone={expectedValueIsZero ? 'neutral' : 'warning'}
            helperText={expectedValueIsZero ? 'The expected value range is €0-€0 for the current recommendation.' : undefined}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="border border-border bg-surface p-4">
            <h4 className="text-xs uppercase tracking-wider text-text-secondary">Economic explanation</h4>
            <p className="mt-3 text-sm leading-relaxed text-text-primary">
              The spread after efficiency is {formatSpread(schedule.spread_after_efficiency)}. After round-trip
              efficiency losses and degradation risk, the expected value does not justify executing a charge/discharge cycle.
            </p>
            {expectedValueIsZero && (
              <p className="mt-2 text-sm text-text-secondary">
                The expected value range is €0-€0 for the current recommendation.
              </p>
            )}
          </div>

          <div className="border border-border bg-surface p-4">
            <h4 className="text-xs uppercase tracking-wider text-text-secondary">Risk explanation</h4>
            <ul className="mt-3 space-y-2">
              {riskBullets.map((bullet) => (
                <li key={bullet} className="text-sm leading-relaxed text-text-secondary">- {bullet}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border border-info/30 bg-info/10 p-4">
          <h4 className="text-xs uppercase tracking-wider text-info">Recommended next step</h4>
          <p className="mt-2 text-sm font-medium text-text-primary">
            Hold operation, monitor updated forecasts, and recompute the recommendation if prices, temperature, or risk appetite change.
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            Wait for a stronger spread after efficiency or use Scenario Analyst to compare relaxed, normal, or strict temperature policy.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="border border-border bg-surface p-4">
            <h4 className="text-xs uppercase tracking-wider text-text-secondary">Hold reasons</h4>
            {holdReasons.length === 0 ? (
              <p className="mt-3 text-sm text-text-muted">No detailed hold reasons were returned.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {holdReasons.map((reason) => (
                  <li key={reason} className="text-sm leading-relaxed text-text-secondary">- {reason}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="border border-border bg-surface p-4">
            <h4 className="text-xs uppercase tracking-wider text-text-secondary">Active alerts</h4>
            {activeAlerts.length === 0 ? (
              <p className="mt-3 text-sm text-text-muted">No active alerts for this recommendation.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {activeAlerts.map((alert, index) => (
                  <div key={`${alert.severity}-${alert.title}-${index}`} className="border border-border bg-surface-elevated/50 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge label={alert.severity.toUpperCase()} tone={alertTone(alert)} />
                      <p className="text-sm font-medium text-text-primary">{alert.title}</p>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-text-secondary">{alert.message}</p>
                    {alert.recommended_action && (
                      <p className="mt-2 text-xs text-text-muted">Recommended action: {alert.recommended_action}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </SectionPanel>
  )
}
