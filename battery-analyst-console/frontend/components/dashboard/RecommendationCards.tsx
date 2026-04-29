'use client'

import React from 'react'
import { ScheduleResponse } from '@/types/api'
import { ConfidenceBadge, DecisionBadge, MetricCard, StressBadge } from '@/components/ui'

interface RecommendationCardsProps {
  schedule: ScheduleResponse
}

function formatEuro(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
    style: 'currency',
    currency: 'EUR'
  }).format(value)
}

function formatCurrencyRange(range: [number, number] | number[]): string {
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

function windowValue(window: ScheduleResponse['charge_window']): string {
  if (window.start === window.end || (window.start === '00:00' && window.end === '00:00')) return 'No trade'
  return `${window.start}-${window.end}`
}

export function RecommendationCards({ schedule }: RecommendationCardsProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <DecisionBadge decision={schedule.decision} size="md" />
        <ConfidenceBadge confidence={schedule.confidence} size="md" />
        <StressBadge level={schedule.battery_stress.level} score={schedule.battery_stress.score} size="md" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Expected value"
          value={formatCurrencyRange(schedule.expected_value_range_eur)}
          tone="positive"
        />
        <MetricCard
          label="Spread after efficiency"
          value={formatSpread(schedule.spread_after_efficiency)}
          tone="info"
        />
        <MetricCard
          label="Charge window"
          value={windowValue(schedule.charge_window)}
          helperText={`Forecast ${formatPrice(schedule.charge_window.avg_price)}`}
        />
        <MetricCard
          label="Discharge window"
          value={windowValue(schedule.discharge_window)}
          helperText={`Forecast ${formatPrice(schedule.discharge_window.avg_price)}`}
        />
        <MetricCard
          label="Stress score"
          value={schedule.battery_stress.score}
          helperText={schedule.battery_stress.level}
          tone={schedule.battery_stress.level === 'low' ? 'positive' : schedule.battery_stress.level === 'medium' ? 'warning' : 'critical'}
        />
      </div>
    </div>
  )
}
