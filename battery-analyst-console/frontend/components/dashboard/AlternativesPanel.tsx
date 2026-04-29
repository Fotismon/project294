'use client'

import React from 'react'
import { AlternativeSchedule } from '@/types/api'
import { DecisionBadge, EmptyState, MetricCard, SectionPanel } from '@/components/ui'

interface AlternativesPanelProps {
  alternatives: AlternativeSchedule[]
}

function formatEuro(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
    style: 'currency',
    currency: 'EUR'
  }).format(value)
}

function formatCurrencyRange(range: number[]): string {
  const low = range[0] ?? 0
  const high = range[1] ?? low
  return `${formatEuro(low)}-${formatEuro(high)}`
}

function formatPrice(value: number): string {
  return `${value.toFixed(1)} EUR/MWh`
}

function windowText(window: AlternativeSchedule['charge_window']): string {
  return window ? `${window.start}-${window.end}` : 'Not returned'
}

export function AlternativesPanel({ alternatives }: AlternativesPanelProps) {
  return (
    <SectionPanel title="Alternatives Considered" subtitle="Other charge and discharge windows evaluated by the scheduler.">
      {alternatives.length === 0 ? (
        <EmptyState title="No alternatives returned." />
      ) : (
        <div className="space-y-4">
          {alternatives.map((alt, index) => {
            const expectedRange = alt.expected_value_range_eur

            return (
              <div key={`${alt.label ?? 'alternative'}-${index}`} className="border border-border bg-surface p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-text-primary">{alt.label || `Alternative ${index + 1}`}</span>
                  <DecisionBadge decision={alt.decision} />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <MetricCard
                    label="Charge window"
                    value={windowText(alt.charge_window)}
                    helperText={alt.charge_window ? formatPrice(alt.charge_window.avg_price) : undefined}
                  />
                  <MetricCard
                    label="Discharge window"
                    value={windowText(alt.discharge_window)}
                    helperText={alt.discharge_window ? formatPrice(alt.discharge_window.avg_price) : undefined}
                  />
                  <MetricCard
                    label="Spread after efficiency"
                    value={`${alt.spread_after_efficiency.toFixed(2)} EUR/MWh`}
                    tone="info"
                  />
                  {expectedRange && expectedRange.length >= 2 && (
                    <MetricCard
                      label="Expected value"
                      value={formatCurrencyRange(expectedRange)}
                      tone="positive"
                    />
                  )}
                </div>
                {alt.reason && <p className="mt-3 text-xs leading-relaxed text-text-secondary">{alt.reason}</p>}
                {alt.rejection_reasons.length > 0 && (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="mb-2 text-xs uppercase tracking-wider text-text-muted">Notes</p>
                    <ul className="space-y-1">
                      {alt.rejection_reasons.map((reason) => (
                        <li key={reason} className="text-xs text-text-secondary">- {reason}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </SectionPanel>
  )
}
