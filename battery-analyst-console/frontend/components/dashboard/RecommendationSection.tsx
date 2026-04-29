'use client'

import React from 'react'
import { Alert, FleetRecommendation, ScheduleResponse, Window } from '@/types/api'
import {
  ConfidenceBadge,
  DecisionBadge,
  EmptyState,
  MetricCard,
  SectionPanel,
  StatusBadge,
  StressBadge
} from '@/components/ui'
import { AlternativesPanel } from './AlternativesPanel'
import { BatteryStressCard } from './BatteryStressCard'
import { ConstraintPanel } from './ConstraintPanel'
import { NoActionPanel } from './NoActionPanel'
import { OptimizerBadge } from './OptimizerBadge'
import { SoCFeasibilityCard } from './SoCFeasibilityCard'

interface RecommendationSectionProps {
  schedule: ScheduleResponse
  fleetRecommendation: FleetRecommendation
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

function formatDelta(range: [number, number]): string {
  return `${formatEuro(range[0])}-${formatEuro(range[1])}`
}

function isExecutableWindow(window: Window | null | undefined): window is Window {
  return Boolean(window && window.start !== window.end && window.start !== '00:00' && window.end !== '00:00')
}

function actionHeadline(decision: ScheduleResponse['decision']): string {
  switch (decision) {
    case 'execute':
      return 'Execute recommended schedule'
    case 'execute_with_caution':
      return 'Execute with caution'
    case 'watch':
      return 'Watch market conditions'
    case 'hold':
      return 'No action recommended'
    default:
      return 'Review recommendation'
  }
}

function actionDescription(schedule: ScheduleResponse): string {
  if (schedule.decision === 'hold') {
    return 'Forecasted spread does not compensate for round-trip efficiency losses and battery degradation risk.'
  }

  if (isExecutableWindow(schedule.charge_window) && isExecutableWindow(schedule.discharge_window)) {
    return `Charge ${schedule.charge_window.start}-${schedule.charge_window.end}, then discharge ${schedule.discharge_window.start}-${schedule.discharge_window.end} if constraints remain acceptable.`
  }

  return schedule.explanation[0] ?? 'Review market conditions before committing fleet dispatch.'
}

function topAlerts(alerts: Alert[]): Alert[] {
  const priority = {
    critical: 0,
    warning: 1,
    info: 2
  }

  return [...alerts]
    .sort((left, right) => priority[left.severity] - priority[right.severity])
    .slice(0, 3)
}

function WindowSummary({ label, window }: { label: string; window: Window }) {
  const executable = isExecutableWindow(window)

  return (
    <div className="border border-border bg-surface px-3 py-2">
      <p className="text-xs uppercase tracking-wider text-text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-text-primary">
        {executable ? `${window.start}-${window.end}` : 'No executable window'}
      </p>
      {executable && <p className="mt-1 text-xs text-text-secondary">{formatPrice(window.avg_price)}</p>}
    </div>
  )
}

function ReasonList({ reasons, emptyTitle }: { reasons: string[]; emptyTitle: string }) {
  const visibleReasons = reasons.slice(0, 5)
  const additionalReasons = reasons.slice(5)

  if (reasons.length === 0) {
    return <EmptyState title={emptyTitle} />
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {visibleReasons.map((reason, index) => (
          <li key={`${reason}-${index}`} className="flex items-start gap-2 text-sm">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-info" />
            <span className="leading-relaxed text-text-primary">{reason}</span>
          </li>
        ))}
      </ul>
      {additionalReasons.length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="text-xs uppercase tracking-wider text-text-muted">Additional reasoning</p>
          <ul className="mt-2 space-y-1">
            {additionalReasons.map((reason, index) => (
              <li key={`${reason}-${index}`} className="text-xs leading-relaxed text-text-secondary">- {reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function CompactAlertRow({ alert }: { alert: Alert }) {
  const tone = alert.severity === 'critical' ? 'critical' : alert.severity === 'warning' ? 'warning' : 'info'

  return (
    <div className="border border-border bg-surface px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge label={alert.severity.toUpperCase()} tone={tone} />
        <p className="text-sm font-medium text-text-primary">{alert.title}</p>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-text-secondary">{alert.message}</p>
      <p className="mt-2 text-xs text-text-muted">Recommended action</p>
      <p className="text-sm text-text-primary">{alert.recommended_action}</p>
    </div>
  )
}

function TopAlerts({ alerts }: { alerts: Alert[] }) {
  const alertsToShow = topAlerts(alerts)

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-xs uppercase tracking-wider text-text-secondary">Top alerts</h4>
        <p className="mt-1 text-xs text-text-muted">Highest priority risk flags for this recommendation.</p>
      </div>
      {alertsToShow.length === 0 ? (
        <p className="border border-border bg-surface px-3 py-2 text-sm text-text-muted">No active alerts for this recommendation.</p>
      ) : (
        <div className="space-y-2">
          {alertsToShow.map((alert, index) => (
            <CompactAlertRow key={`${alert.severity}-${alert.title}-${index}`} alert={alert} />
          ))}
        </div>
      )}
    </div>
  )
}

export function RecommendationSection({ schedule, fleetRecommendation }: RecommendationSectionProps) {
  if (schedule.decision === 'hold') {
    return (
      <div className="space-y-5">
        <NoActionPanel schedule={schedule} />
        <OptimizerBadge optimizer={schedule.optimizer} />

        {fleetRecommendation.warnings.length > 0 && (
          <div className="border border-warning/30 bg-warning/10 p-4">
            <p className="mb-2 text-xs uppercase tracking-wider text-warning">Fleet warnings</p>
            <ul className="space-y-1">
              {fleetRecommendation.warnings.map((warning) => (
                <li key={warning} className="text-sm text-text-secondary">- {warning}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <ConstraintPanel constraints={schedule.physical_constraints} />
            <BatteryStressCard stress={schedule.battery_stress} />
          </div>
          <div className="space-y-6">
            <SoCFeasibilityCard feasibility={schedule.soc_feasibility} />
            <AlternativesPanel alternatives={schedule.alternatives} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <SectionPanel
      title="Fleet Recommendation"
      subtitle="Risk-adjusted operating decision for the current forecast."
    >
      <div className="space-y-5">
        <div className="border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center gap-2">
            <DecisionBadge decision={schedule.decision} size="md" />
            <ConfidenceBadge confidence={schedule.confidence} size="md" />
            <StressBadge level={schedule.battery_stress.level} score={schedule.battery_stress.score} size="md" />
            <OptimizerBadge optimizer={schedule.optimizer} compact />
          </div>
          <h3 className="mt-4 text-2xl font-semibold text-text-primary">{actionHeadline(schedule.decision)}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary">{actionDescription(schedule)}</p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Expected value" value={formatEuroRange(schedule.expected_value_range_eur)} tone="positive" />
          <MetricCard label="Spread after efficiency" value={formatSpread(schedule.spread_after_efficiency)} tone="info" />
          <MetricCard label="Manual overrides" value={fleetRecommendation.manual_override_count} />
          <MetricCard label="Override value delta" value={formatDelta(fleetRecommendation.override_value_delta_eur)} />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <WindowSummary label="Charge" window={schedule.charge_window} />
          <WindowSummary label="Discharge" window={schedule.discharge_window} />
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
          <SectionPanel title="Why this recommendation?">
            <ReasonList reasons={schedule.explanation} emptyTitle="No explanation was returned for this recommendation." />
          </SectionPanel>
          <TopAlerts alerts={schedule.alerts} />
        </div>
      </div>

      {fleetRecommendation.warnings.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="mb-2 text-xs uppercase tracking-wider text-warning">Fleet warnings</p>
          <ul className="space-y-1">
            {fleetRecommendation.warnings.map((warning) => (
              <li key={warning} className="text-sm text-text-secondary">- {warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <ConstraintPanel constraints={schedule.physical_constraints} />
          <BatteryStressCard stress={schedule.battery_stress} />
        </div>
        <div className="space-y-6">
          <SoCFeasibilityCard feasibility={schedule.soc_feasibility} />
          <AlternativesPanel alternatives={schedule.alternatives} />
        </div>
      </div>
    </SectionPanel>
  )
}
