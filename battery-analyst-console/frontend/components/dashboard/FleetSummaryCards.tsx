'use client'

import React from 'react'
import { FleetSummary } from '@/types/api'
import { MetricCard } from './MetricCard'

interface FleetSummaryCardsProps {
  summary: FleetSummary
}

export function FleetSummaryCards({ summary }: FleetSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-9">
      <MetricCard label="Total Assets" value={summary.total_assets} size="sm" />
      <MetricCard label="Available" value={summary.available_assets} size="sm" variant={summary.available_assets === summary.total_assets ? 'success' : 'warning'} />
      <MetricCard label="Capacity" value={summary.total_capacity_mwh.toFixed(0)} unit="MWh" size="sm" />
      <MetricCard label="Power" value={summary.total_power_mw.toFixed(0)} unit="MW" size="sm" />
      <MetricCard label="Avg SoC" value={Math.round(summary.average_soc * 100)} unit="%" size="sm" />
      <MetricCard label="Charging" value={summary.assets_charging} size="sm" variant="success" />
      <MetricCard label="Discharging" value={summary.assets_discharging} size="sm" variant="info" />
      <MetricCard label="Idle" value={summary.assets_idle} size="sm" />
      <MetricCard label="Fleet Value" value={`€${summary.expected_value_eur[0]}-€${summary.expected_value_eur[1]}`} size="sm" />
    </div>
  )
}
