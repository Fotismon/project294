'use client'

import React from 'react'
import { AlternativeSchedule, Confidence, ScheduleResponse, Window } from '@/types/api'
import { ConfidenceBadge, DecisionBadge, EmptyState, SectionPanel, StatusBadge, StressBadge } from '@/components/ui'

interface ScheduleTradeoffMatrixProps {
  schedule: ScheduleResponse
  className?: string
}

interface TradeoffRow {
  key: string
  label: string
  chargeWindow: Window | null
  dischargeWindow: Window | null
  expectedValue: number[]
  stressLevel: ScheduleResponse['battery_stress']['level']
  stressScore: number
  confidence: Confidence | string
  status: 'Recommended' | 'Not preferred'
  reason: string
  approximated: boolean
}

function formatWindow(window: Window | null | undefined): string {
  if (!window || window.start === window.end) return 'No window'
  return `${window.start}-${window.end}`
}

function formatWindowPrice(window: Window | null | undefined): string {
  if (!window) return ''
  return `${window.avg_price.toFixed(1)} €/MWh`
}

function formatEuroRange(range?: number[] | [number, number]): string {
  if (!range?.length) return '-'
  const low = range[0] ?? 0
  const high = range[1] ?? low
  return `€${low}-€${high}`
}

function humanizeConfidence(value: string): string {
  return value.replace(/_/g, '-').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function summaryCopy(schedule: ScheduleResponse): string {
  if (schedule.decision === 'hold') return 'No-action is recommended because the tradeoff is not economically or physically attractive.'
  if (schedule.battery_stress.level === 'high') return 'Higher value may come with elevated battery stress; review alternatives before execution.'
  return 'Recommended schedule balances expected value with stress and feasibility constraints.'
}

function selectedReason(schedule: ScheduleResponse): string {
  return schedule.explanation.find((item) => item.trim().length > 0)
    ?? 'Selected by the scheduler based on spread, feasibility, stress, and confidence.'
}

function alternativeReason(alternative: AlternativeSchedule): string {
  return alternative.reason
    ?? alternative.rejection_reasons[0]
    ?? 'Alternative considered but not selected.'
}

function buildRows(schedule: ScheduleResponse): TradeoffRow[] {
  const selected: TradeoffRow = {
    key: 'recommended',
    label: 'Recommended',
    chargeWindow: schedule.charge_window,
    dischargeWindow: schedule.discharge_window,
    expectedValue: schedule.expected_value_range_eur,
    stressLevel: schedule.battery_stress.level,
    stressScore: schedule.battery_stress.score,
    confidence: schedule.confidence,
    status: 'Recommended',
    reason: selectedReason(schedule),
    approximated: false
  }

  const alternatives = schedule.alternatives.map((alternative, index): TradeoffRow => ({
    key: alternative.label ?? `alternative-${index}`,
    label: alternative.label ?? `Alternative ${index + 1}`,
    chargeWindow: alternative.charge_window,
    dischargeWindow: alternative.discharge_window,
    expectedValue: alternative.expected_value_range_eur ?? schedule.expected_value_range_eur,
    stressLevel: schedule.battery_stress.level,
    stressScore: schedule.battery_stress.score,
    confidence: schedule.confidence,
    status: 'Not preferred',
    reason: alternativeReason(alternative),
    approximated: true
  }))

  return [selected, ...alternatives]
}

export function ScheduleTradeoffMatrix({ schedule, className = '' }: ScheduleTradeoffMatrixProps) {
  const rows = buildRows(schedule)
  const isHold = schedule.decision === 'hold'

  return (
    <SectionPanel
      title="Profit vs Asset Health"
      subtitle="Compare candidate schedules by expected value, battery stress, and decision quality."
      className={className}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 text-sm text-text-secondary lg:flex-row lg:items-center lg:justify-between">
          <p>{summaryCopy(schedule)}</p>
          {isHold && <DecisionBadge decision={schedule.decision} />}
        </div>

        {isHold ? (
          <div className="space-y-3">
            <EmptyState
              title="No executable tradeoff"
              message="The current recommendation is hold, so no charge/discharge schedule should be compared as executable."
            />
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div className="border border-border bg-surface p-3">
                <p className="text-xs uppercase tracking-wider text-text-muted">Spread after efficiency</p>
                <p className="mt-1 text-text-primary">{schedule.spread_after_efficiency.toFixed(1)} €/MWh</p>
              </div>
              <div className="border border-border bg-surface p-3">
                <p className="text-xs uppercase tracking-wider text-text-muted">Expected value</p>
                <p className="mt-1 text-text-primary">{formatEuroRange(schedule.expected_value_range_eur)}</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-b border-border bg-surface text-xs uppercase tracking-wider text-text-muted">
                  <tr>
                    <th className="px-3 py-3">Schedule</th>
                    <th className="px-3 py-3">Charge window</th>
                    <th className="px-3 py-3">Discharge window</th>
                    <th className="px-3 py-3">Expected value</th>
                    <th className="px-3 py-3">Stress</th>
                    <th className="px-3 py-3">Confidence</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <tr key={row.key} className={row.status === 'Recommended' ? 'border-l-2 border-info bg-info/5' : 'border-l-2 border-transparent'}>
                      <td className="px-3 py-3 align-top font-medium text-text-primary">{row.label}</td>
                      <td className="px-3 py-3 align-top">
                        <p className="text-text-primary">{formatWindow(row.chargeWindow)}</p>
                        <p className="text-xs text-text-muted">{formatWindowPrice(row.chargeWindow)}</p>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <p className="text-text-primary">{formatWindow(row.dischargeWindow)}</p>
                        <p className="text-xs text-text-muted">{formatWindowPrice(row.dischargeWindow)}</p>
                      </td>
                      <td className="px-3 py-3 align-top font-medium text-text-primary">{formatEuroRange(row.expectedValue)}</td>
                      <td className="px-3 py-3 align-top">
                        <StressBadge level={row.stressLevel} score={row.stressScore} />
                        {row.approximated && <p className="mt-1 text-xs text-text-muted">{row.stressScore} approx.</p>}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <ConfidenceBadge confidence={row.confidence} />
                        {row.approximated && <p className="mt-1 text-xs text-text-muted">{humanizeConfidence(row.confidence)} approx.</p>}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <StatusBadge label={row.status} tone={row.status === 'Recommended' ? 'positive' : 'neutral'} />
                      </td>
                      <td className="max-w-[320px] px-3 py-3 align-top text-text-secondary">{row.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {schedule.alternatives.length === 0 && (
              <EmptyState
                title="No alternatives returned"
                message="The backend did not return alternative schedules for this recommendation."
              />
            )}

            <p className="text-xs leading-relaxed text-text-muted">
              Alternative stress and confidence are approximated from the selected schedule until per-alternative scoring is exposed by the backend.
            </p>
          </>
        )}
      </div>
    </SectionPanel>
  )
}
