'use client'

import React from 'react'
import { ScheduleResponse } from '@/types/api'
import {
  ConfidenceBadge,
  DecisionBadge,
  EmptyState,
  MetricCard,
  SectionPanel,
  StatusBadge,
  StressBadge
} from '@/components/ui'

interface ScenarioComparisonPanelProps {
  baseSchedule: ScheduleResponse | null
  scenarioSchedule: ScheduleResponse | null
}

function formatEuro(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
    style: 'currency',
    currency: 'EUR'
  }).format(value)
}

function formatSignedEuro(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatEuro(value)}`
}

function formatSignedNumber(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value}`
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatEuroRange(range: [number, number] | number[]): string {
  const low = range[0] ?? 0
  const high = range[1] ?? low
  return `${formatEuro(low)}-${formatEuro(high)}`
}

function midpoint(range: [number, number] | number[]): number {
  const low = range[0] ?? 0
  const high = range[1] ?? low
  return Math.round((low + high) / 2)
}

function decisionRank(decision: string): number {
  const ranks: Record<string, number> = {
    hold: 0,
    watch: 1,
    execute_with_caution: 2,
    execute: 3
  }

  return ranks[decision] ?? 1
}

function confidenceRank(confidence: string): number {
  const ranks: Record<string, number> = {
    low: 0,
    medium: 1,
    medium_high: 2,
    high: 3
  }

  return ranks[confidence] ?? 1
}

function confidenceDeltaLabel(delta: number): string {
  if (delta > 0) return 'Improved'
  if (delta < 0) return 'Lower'
  return 'Unchanged'
}

function alertSeverityCounts(schedule: ScheduleResponse): { critical: number; warning: number; info: number } {
  return schedule.alerts.reduce(
    (counts, alert) => ({
      ...counts,
      [alert.severity]: counts[alert.severity] + 1
    }),
    { critical: 0, warning: 0, info: 0 }
  )
}

function alertTotal(schedule: ScheduleResponse): number {
  const counts = alertSeverityCounts(schedule)
  return counts.critical + counts.warning + counts.info
}

function deltaTone(value: number, positiveIsGood = true): 'positive' | 'warning' | 'neutral' {
  if (value === 0) return 'neutral'
  return positiveIsGood ? (value > 0 ? 'positive' : 'warning') : (value < 0 ? 'positive' : 'warning')
}

function decisionChangeTone(baseDecision: string, scenarioDecision: string): 'positive' | 'warning' | 'critical' | 'neutral' {
  if (baseDecision === scenarioDecision) return 'neutral'
  if (scenarioDecision === 'hold') return 'critical'
  return decisionRank(scenarioDecision) > decisionRank(baseDecision) ? 'positive' : 'warning'
}

function buildDeltaInterpretation(baseSchedule: ScheduleResponse, scenarioSchedule: ScheduleResponse): string {
  const valueDelta = midpoint(scenarioSchedule.expected_value_range_eur) - midpoint(baseSchedule.expected_value_range_eur)
  const stressDelta = scenarioSchedule.battery_stress.score - baseSchedule.battery_stress.score
  const alertsDelta = alertTotal(scenarioSchedule) - alertTotal(baseSchedule)

  if (scenarioSchedule.decision === 'hold') {
    return 'The scenario produces a no-action recommendation. Review active alerts and economics before changing operating assumptions.'
  }

  if (
    (baseSchedule.decision === 'hold' || baseSchedule.decision === 'watch') &&
    (scenarioSchedule.decision === 'execute' || scenarioSchedule.decision === 'execute_with_caution')
  ) {
    return 'The scenario makes dispatch more attractive, but verify constraints and alerts before execution.'
  }

  if (valueDelta > 0 && stressDelta < 0) {
    return 'The scenario improves both value and stress profile.'
  }

  if (valueDelta > 0 && stressDelta > 0) {
    return 'Scenario improves expected value but increases battery stress. Review the profit vs asset-health tradeoff.'
  }

  if (valueDelta < 0 && stressDelta < 0) {
    return 'Scenario is more conservative: lower expected value, but better battery health.'
  }

  if (alertsDelta > 0) {
    return 'Scenario introduces additional operational warnings.'
  }

  if (stressDelta < 0) {
    return 'The scenario lowers battery stress while preserving the recommendation context.'
  }

  if (valueDelta > 0) {
    return 'The scenario improves expected value without changing the primary decision category.'
  }

  return 'The scenario changes are modest. Review the delta metrics and alerts before changing operating assumptions.'
}

function ScheduleSummaryCard({ label, schedule }: { label: string; schedule: ScheduleResponse }) {
  return (
    <div className="border border-border bg-surface p-4">
      <p className="text-xs uppercase tracking-wider text-text-muted">{label}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <DecisionBadge decision={schedule.decision} />
        <ConfidenceBadge confidence={schedule.confidence} />
        <StressBadge level={schedule.battery_stress.level} score={schedule.battery_stress.score} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-text-muted">Expected value</dt>
          <dd className="mt-1 font-semibold text-text-primary">{formatEuroRange(schedule.expected_value_range_eur)}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Alerts</dt>
          <dd className="mt-1 font-semibold text-text-primary">{alertTotal(schedule)}</dd>
        </div>
      </dl>
    </div>
  )
}

export function ScenarioComparisonPanel({
  baseSchedule,
  scenarioSchedule
}: ScenarioComparisonPanelProps) {
  if (!baseSchedule || !scenarioSchedule) {
    return (
      <SectionPanel
        title="Base vs Scenario"
        subtitle="Compare how assumption changes affect value, stress, confidence, and alerts."
      >
        <EmptyState
          title="No scenario run yet"
          message="Change assumptions and run a scenario to compare against the current base schedule."
        />
      </SectionPanel>
    )
  }

  const baseValue = midpoint(baseSchedule.expected_value_range_eur)
  const scenarioValue = midpoint(scenarioSchedule.expected_value_range_eur)
  const valueDelta = scenarioValue - baseValue
  const stressDelta = scenarioSchedule.battery_stress.score - baseSchedule.battery_stress.score
  const confidenceDelta = confidenceRank(scenarioSchedule.confidence) - confidenceRank(baseSchedule.confidence)
  const baseAlerts = alertSeverityCounts(baseSchedule)
  const scenarioAlerts = alertSeverityCounts(scenarioSchedule)
  const baseAlertTotal = alertTotal(baseSchedule)
  const scenarioAlertTotal = alertTotal(scenarioSchedule)
  const alertsDelta = alertTotal(scenarioSchedule) - alertTotal(baseSchedule)
  const decisionChanged = baseSchedule.decision !== scenarioSchedule.decision

  return (
    <SectionPanel
      title="Base vs Scenario"
      subtitle="Compare how assumption changes affect value, stress, confidence, and alerts."
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ScheduleSummaryCard label="Base case" schedule={baseSchedule} />
          <ScheduleSummaryCard label="Scenario" schedule={scenarioSchedule} />
        </div>

        <div>
          <h4 className="mb-3 text-xs uppercase tracking-wider text-text-secondary">Result deltas</h4>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            <MetricCard
              label="Decision changed?"
              value={decisionChanged ? 'Yes' : 'No'}
              helperText={decisionChanged
                ? `${humanize(baseSchedule.decision)} -> ${humanize(scenarioSchedule.decision)}`
                : `${humanize(baseSchedule.decision)} unchanged`}
              tone={decisionChangeTone(baseSchedule.decision, scenarioSchedule.decision)}
            />
            <MetricCard
              label="Value delta"
              value={formatSignedEuro(valueDelta)}
              helperText="Scenario expected value vs base case"
              tone={deltaTone(valueDelta)}
            />
            <MetricCard
              label="Stress delta"
              value={formatSignedNumber(stressDelta)}
              helperText={`Battery stress score change: ${baseSchedule.battery_stress.level} -> ${scenarioSchedule.battery_stress.level}`}
              tone={deltaTone(stressDelta, false)}
            />
            <MetricCard
              label="Confidence delta"
              value={confidenceDeltaLabel(confidenceDelta)}
              helperText={`${humanize(baseSchedule.confidence)} -> ${humanize(scenarioSchedule.confidence)}`}
              tone={deltaTone(confidenceDelta)}
            />
            <MetricCard
              label="Alert count delta"
              value={formatSignedNumber(alertsDelta)}
              helperText={`${baseAlertTotal} -> ${scenarioAlertTotal} alerts. Critical ${baseAlerts.critical}->${scenarioAlerts.critical}, warning ${baseAlerts.warning}->${scenarioAlerts.warning}`}
              tone={deltaTone(alertsDelta, false)}
            />
          </div>
        </div>

        <div className="border border-info/30 bg-info/10 p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge label="Interpretation" tone="info" />
            <StressBadge level={scenarioSchedule.battery_stress.level} score={scenarioSchedule.battery_stress.score} />
          </div>
          <p className="text-sm leading-relaxed text-text-primary">{buildDeltaInterpretation(baseSchedule, scenarioSchedule)}</p>
        </div>
      </div>
    </SectionPanel>
  )
}
