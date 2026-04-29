'use client'

import React from 'react'
import { AlternativeSchedule, BatteryStressLevel, ScheduleResponse, Window } from '@/types/api'
import { ConfidenceBadge, DecisionBadge, MetricCard, SectionPanel, StatusBadge, StressBadge } from '@/components/ui'

interface ProfitHealthComparisonCardProps {
  schedule: ScheduleResponse
  className?: string
}

interface ComparisonOption {
  title: string
  status: 'Recommended' | 'Not preferred'
  expectedValue: number[]
  chargeWindow: Window | null
  dischargeWindow: Window | null
  stressLevel: BatteryStressLevel
  stressScore: number
  reason: string
  note?: string
}

function formatEuroRange(range?: number[] | [number, number]): string {
  if (!range?.length) return '-'
  const low = range[0] ?? 0
  const high = range[1] ?? low
  return `€${low}-€${high}`
}

function formatWindow(window?: Window | null): string {
  if (!window || window.start === window.end) return 'No window'
  return `${window.start}-${window.end}`
}

function formatWindowWithPrice(window?: Window | null): string {
  if (!window || window.start === window.end) return 'No executable window'
  return `${formatWindow(window)} @ ${window.avg_price.toFixed(1)} €/MWh`
}

function nextStressLevel(level: string): BatteryStressLevel {
  if (level === 'low') return 'medium'
  if (level === 'medium') return 'high'
  return 'high'
}

function clampScore(score: number): number {
  return Math.min(100, Math.max(0, Math.round(score)))
}

function upperValue(range?: number[] | [number, number]): number {
  if (!range?.length) return 0
  return range[1] ?? range[0] ?? 0
}

function selectedOption(schedule: ScheduleResponse): ComparisonOption {
  return {
    title: 'Health-aware recommendation',
    status: 'Recommended',
    expectedValue: schedule.expected_value_range_eur,
    chargeWindow: schedule.charge_window,
    dischargeWindow: schedule.discharge_window,
    stressLevel: schedule.battery_stress.level,
    stressScore: schedule.battery_stress.score,
    reason: 'Lower immediate value, better asset-health profile.'
  }
}

function highestValueAlternative(schedule: ScheduleResponse): AlternativeSchedule | null {
  if (schedule.alternatives.length === 0) return null

  return schedule.alternatives.reduce((best, current) => (
    upperValue(current.expected_value_range_eur) > upperValue(best.expected_value_range_eur) ? current : best
  ))
}

function valueOption(schedule: ScheduleResponse, alternative: AlternativeSchedule | null): ComparisonOption {
  if (!alternative) {
    return {
      title: 'Value-maximizing option',
      status: 'Not preferred',
      expectedValue: schedule.expected_value_range_eur,
      chargeWindow: schedule.charge_window,
      dischargeWindow: schedule.discharge_window,
      stressLevel: schedule.battery_stress.level,
      stressScore: schedule.battery_stress.score,
      reason: 'No alternative schedules were returned, so the comparison uses the selected schedule only.',
      note: 'MVP comparison baseline'
    }
  }

  const alternativeValue = alternative.expected_value_range_eur ?? schedule.expected_value_range_eur
  const valueIsHigher = upperValue(alternativeValue) > upperValue(schedule.expected_value_range_eur)

  return {
    title: alternative.label ?? 'Value-maximizing option',
    status: 'Not preferred',
    expectedValue: alternativeValue,
    chargeWindow: alternative.charge_window,
    dischargeWindow: alternative.discharge_window,
    stressLevel: valueIsHigher ? nextStressLevel(schedule.battery_stress.level) : schedule.battery_stress.level,
    stressScore: valueIsHigher ? clampScore(schedule.battery_stress.score + 15) : schedule.battery_stress.score,
    reason: valueIsHigher ? 'Higher value, higher estimated stress.' : (alternative.reason ?? 'Alternative considered but not selected.'),
    note: 'MVP approximation'
  }
}

function storyText(schedule: ScheduleResponse, alternative: AlternativeSchedule | null): string {
  if (schedule.decision === 'hold') {
    return 'Hold operation is the health-aware recommendation. Forecasted spread does not compensate for round-trip efficiency losses and degradation risk.'
  }

  const alternativeValue = alternative?.expected_value_range_eur
  if (alternative && upperValue(alternativeValue) > upperValue(schedule.expected_value_range_eur)) {
    return 'Schedule A offers higher expected value, but it may increase battery stress. The selected schedule is more health-aware because it balances spread capture with SoC, temperature, and degradation risk.'
  }

  return alternative
    ? 'The selected schedule balances expected value with battery stress and feasibility constraints.'
    : 'The selected schedule balances expected value with battery stress and feasibility constraints. No alternative schedules were returned for comparison.'
}

function factors(schedule: ScheduleResponse): string[] {
  const items = [
    `Spread after efficiency: ${schedule.spread_after_efficiency.toFixed(1)} €/MWh`,
    `Battery stress: ${schedule.battery_stress.level}, score ${schedule.battery_stress.score}`,
    schedule.soc_feasibility.feasible ? 'SoC feasibility passed' : 'SoC feasibility has violations',
    `Confidence: ${schedule.confidence.replace(/_/g, '-')}`
  ]

  schedule.battery_stress.reasons.slice(0, 1).forEach((reason) => items.push(reason))
  schedule.alerts.slice(0, 1).forEach((alert) => items.push(`${alert.title}: ${alert.message}`))

  return items.slice(0, 5)
}

function holdOptions(schedule: ScheduleResponse): [ComparisonOption, ComparisonOption] {
  return [
    {
      title: 'Force execution',
      status: 'Not preferred',
      expectedValue: schedule.expected_value_range_eur,
      chargeWindow: schedule.charge_window,
      dischargeWindow: schedule.discharge_window,
      stressLevel: 'high',
      stressScore: 90,
      reason: 'Spread does not compensate for losses and degradation risk.'
    },
    {
      title: 'Hold operation',
      status: 'Recommended',
      expectedValue: [0, 0],
      chargeWindow: null,
      dischargeWindow: null,
      stressLevel: 'low',
      stressScore: 0,
      reason: 'Protects asset health and avoids weak economics.'
    }
  ]
}

function OptionCard({ option }: { option: ComparisonOption }) {
  return (
    <div className={`border p-4 ${option.status === 'Recommended' ? 'border-info bg-info/5' : 'border-border bg-surface'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-text-primary">{option.title}</h4>
          {option.note && <p className="mt-1 text-xs text-text-muted">{option.note}</p>}
        </div>
        <StatusBadge label={option.status} tone={option.status === 'Recommended' ? 'positive' : 'neutral'} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3">
        <MetricCard label="Expected value" value={formatEuroRange(option.expectedValue)} tone={option.status === 'Recommended' ? 'positive' : 'info'} />
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-text-muted">Charge</p>
            <p className="mt-1 text-text-primary">{formatWindowWithPrice(option.chargeWindow)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-text-muted">Discharge</p>
            <p className="mt-1 text-text-primary">{formatWindowWithPrice(option.dischargeWindow)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StressBadge level={option.stressLevel} score={option.stressScore} />
          {option.note && <span className="text-xs text-text-muted">Approximate until backend exposes per-alternative stress.</span>}
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-text-secondary">{option.reason}</p>
    </div>
  )
}

export function ProfitHealthComparisonCard({ schedule, className = '' }: ProfitHealthComparisonCardProps) {
  const alternative = highestValueAlternative(schedule)
  const options = schedule.decision === 'hold'
    ? holdOptions(schedule)
    : [valueOption(schedule, alternative), selectedOption(schedule)]
  const consideredFactors = factors(schedule)

  return (
    <SectionPanel
      title="Profit vs asset health"
      subtitle="Compare immediate value against long-term battery stress."
      className={className}
    >
      <div className="space-y-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <DecisionBadge decision={schedule.decision} />
            <ConfidenceBadge confidence={schedule.confidence} />
          </div>
          <p className="text-sm leading-relaxed text-text-secondary">{storyText(schedule, alternative)}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <OptionCard option={options[0]} />
          <OptionCard option={options[1]} />
        </div>

        <div className="border-t border-border pt-4">
          <h4 className="mb-2 text-xs uppercase tracking-wider text-text-secondary">Factors considered</h4>
          <ul className="space-y-1">
            {consideredFactors.map((factor) => (
              <li key={factor} className="text-sm text-text-secondary">- {factor}</li>
            ))}
          </ul>
        </div>
      </div>
    </SectionPanel>
  )
}
