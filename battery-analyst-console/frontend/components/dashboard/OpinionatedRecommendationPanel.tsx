'use client'

import React from 'react'
import { ScheduleResponse } from '@/types/api'
import { ConfidenceBadge, DecisionBadge, SectionPanel, StressBadge } from '@/components/ui'

interface OpinionatedRecommendationPanelProps {
  schedule: ScheduleResponse
  className?: string
}

function formatEuroRange(range: [number, number] | number[]): string {
  const low = range[0] ?? 0
  const high = range[1] ?? low
  return `€${low}-€${high}`
}

function formatSpread(value: number): string {
  return `${value.toFixed(1)} €/MWh`
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function humanize(value: string): string {
  return value.replace(/_/g, '-').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function hasTemperatureWarning(schedule: ScheduleResponse): boolean {
  const alertHasTemperature = schedule.alerts.some((alert) => (
    `${alert.title} ${alert.message}`.toLowerCase().includes('temperature')
  ))
  const stressHasTemperature = schedule.battery_stress.reasons.some((reason) => (
    reason.toLowerCase().includes('temperature')
  ))

  return alertHasTemperature || stressHasTemperature || !schedule.physical_constraints.temperature_ok
}

function physicalConstraintsPassed(schedule: ScheduleResponse): boolean {
  const constraints = schedule.physical_constraints
  const required = [
    constraints.duration_ok,
    constraints.cycle_limit_ok,
    constraints.temperature_ok,
    constraints.round_trip_efficiency_applied,
    constraints.rapid_switching_avoided
  ]

  if (typeof constraints.soc_feasible === 'boolean') required.push(constraints.soc_feasible)
  return required.every(Boolean)
}

function buildAnalystVerdict(schedule: ScheduleResponse): string {
  if (schedule.decision === 'execute') {
    return 'Execution is recommended because the spread remains attractive after efficiency losses, battery stress is acceptable, and SoC feasibility checks passed.'
  }

  if (schedule.decision === 'execute_with_caution') {
    return 'Execution may be attractive, but caution is required because one or more risk signals are active.'
  }

  if (schedule.decision === 'watch') {
    return 'The opportunity is worth monitoring, but current confidence or risk-adjusted value is not strong enough for automatic execution.'
  }

  if (schedule.decision === 'hold') {
    return 'No action is recommended because the forecasted spread does not sufficiently compensate for round-trip efficiency losses, degradation risk, or operational constraints.'
  }

  return 'The recommendation is based on spread quality, confidence, battery stress, SoC feasibility, and operational constraints.'
}

function buildRecommendationBullets(schedule: ScheduleResponse): string[] {
  const bullets = [
    `Spread after efficiency is ${formatSpread(schedule.spread_after_efficiency)}.`,
    `Expected value range is ${formatEuroRange(schedule.expected_value_range_eur)}.`,
    `Battery stress is ${schedule.battery_stress.level} with score ${schedule.battery_stress.score}.`,
    schedule.soc_feasibility.feasible
      ? `SoC feasibility passed with end SoC at ${formatPercent(schedule.soc_feasibility.end_soc)}.`
      : `SoC feasibility failed with ${schedule.soc_feasibility.violations.length} violation(s).`,
    physicalConstraintsPassed(schedule)
      ? 'Physical constraints passed.'
      : 'One or more physical constraints require review.',
    `Confidence is ${humanize(schedule.confidence)}.`
  ]

  if (hasTemperatureWarning(schedule)) {
    bullets.splice(4, 0, 'Temperature warning is active; avoid automatic execution without review.')
  }

  return bullets.slice(0, 6)
}

function buildOperatorNextStep(schedule: ScheduleResponse): string {
  if (schedule.decision === 'execute') {
    return 'Proceed with the recommended charge and discharge windows, while monitoring updated market prices.'
  }

  if (schedule.decision === 'execute_with_caution') {
    return 'Review active alerts before dispatch and monitor SoC and temperature during the discharge window.'
  }

  if (schedule.decision === 'watch') {
    return 'Do not dispatch automatically; monitor updated forecasts or rerun scenario assumptions.'
  }

  if (schedule.decision === 'hold') {
    return 'Keep the fleet idle and wait for a stronger spread or lower operational risk.'
  }

  return 'Review the recommendation before dispatch.'
}

export function OpinionatedRecommendationPanel({ schedule, className = '' }: OpinionatedRecommendationPanelProps) {
  const bullets = buildRecommendationBullets(schedule)
  const backendReasoning = schedule.explanation.slice(0, 3)
  const reasonTitle = schedule.decision === 'hold' ? 'Hold because' : 'Recommended because'

  return (
    <SectionPanel
      title="Analyst View"
      subtitle="Opinionated reasoning behind the recommended action."
      className={className}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <DecisionBadge decision={schedule.decision} />
          <ConfidenceBadge confidence={schedule.confidence} />
          <StressBadge level={schedule.battery_stress.level} score={schedule.battery_stress.score} />
        </div>

        {schedule.decision === 'hold' && (
          <div className="border border-warning/30 bg-warning/10 p-3">
            <p className="text-sm font-medium text-warning">No action is the recommendation.</p>
            <p className="mt-1 text-sm text-text-secondary">Forecasted spread does not compensate for round-trip efficiency and degradation risk.</p>
          </div>
        )}

        <p className="text-sm leading-relaxed text-text-primary">{buildAnalystVerdict(schedule)}</p>

        <div>
          <h4 className="mb-2 text-xs uppercase tracking-wider text-text-secondary">{reasonTitle}</h4>
          <ul className="space-y-1">
            {bullets.map((bullet) => (
              <li key={bullet} className="text-sm text-text-secondary">- {bullet}</li>
            ))}
          </ul>
        </div>

        <div className="border border-border bg-surface p-3">
          <p className="text-xs uppercase tracking-wider text-text-muted">Operator next step</p>
          <p className="mt-1 text-sm font-medium text-text-primary">{buildOperatorNextStep(schedule)}</p>
        </div>

        {backendReasoning.length > 0 && (
          <div className="border-t border-border pt-4">
            <h4 className="mb-2 text-xs uppercase tracking-wider text-text-secondary">Backend reasoning</h4>
            <ul className="space-y-1">
              {backendReasoning.map((reason) => (
                <li key={reason} className="text-xs text-text-muted">- {reason}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </SectionPanel>
  )
}
