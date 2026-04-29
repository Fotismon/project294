'use client'

import React from 'react'
import { ScheduleResponse } from '@/types/api'
import { MetricCard } from './MetricCard'

interface RecommendationCardsProps {
  schedule: ScheduleResponse
}

function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function decisionVariant(decision: ScheduleResponse['decision']) {
  if (decision === 'execute') return 'success'
  if (decision === 'execute_with_caution') return 'warning'
  if (decision === 'watch') return 'info'
  return 'error'
}

function windowValue(window: ScheduleResponse['charge_window']): string {
  if (window.start === window.end) return 'No trade'
  return `${window.start}-${window.end}`
}

export function RecommendationCards({ schedule }: RecommendationCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
      <MetricCard label="Decision" value={titleCase(schedule.decision)} variant={decisionVariant(schedule.decision)} size="sm" />
      <MetricCard label="Confidence" value={titleCase(schedule.confidence)} size="sm" />
      <MetricCard
        label="Charge Window"
        value={windowValue(schedule.charge_window)}
        subValue={`@ ${schedule.charge_window.avg_price} €/MWh`}
        size="sm"
      />
      <MetricCard
        label="Discharge Window"
        value={windowValue(schedule.discharge_window)}
        subValue={`@ ${schedule.discharge_window.avg_price} €/MWh`}
        size="sm"
      />
      <MetricCard label="Expected Value" value={`€${schedule.expected_value_range_eur[0]}-€${schedule.expected_value_range_eur[1]}`} size="sm" />
      <MetricCard label="Spread After RTE" value={schedule.spread_after_efficiency.toFixed(1)} unit="€/MWh" size="sm" />
      <MetricCard
        label="Battery Stress"
        value={schedule.battery_stress.score}
        subValue={titleCase(schedule.battery_stress.level)}
        variant={schedule.battery_stress.level === 'low' ? 'success' : schedule.battery_stress.level === 'medium' ? 'warning' : 'error'}
        size="sm"
      />
    </div>
  )
}
