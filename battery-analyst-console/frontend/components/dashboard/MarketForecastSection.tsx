'use client'

import React from 'react'
import { ForecastPoint, ScheduleResponse } from '@/types/api'
import { ForecastChart } from './ForecastChart'
import { MetricCard } from './MetricCard'

interface MarketForecastSectionProps {
  forecastData: ForecastPoint[]
  schedule: ScheduleResponse
  currentSignal: 'charge' | 'discharge' | 'idle' | 'mixed'
}

export function MarketForecastSection({ forecastData, schedule, currentSignal }: MarketForecastSectionProps) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Market Forecast</h2>
          <p className="mt-1 text-sm text-text-secondary">Forecast signal drives the automatic fleet recommendation.</p>
        </div>
        <div className="text-xs text-text-muted">
          Flow: Market Forecast → Fleet Manager → Battery Asset → Recommendation
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        <div className="rounded-lg border border-border bg-surface-elevated/50 p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xs uppercase tracking-wider text-text-secondary">Price Forecast</h3>
            <div className="flex gap-3 text-xs text-text-muted">
              <span>Low-price charge window</span>
              <span>High-price discharge window</span>
              <span>Idle/no-go periods</span>
            </div>
          </div>
          <ForecastChart data={forecastData} chargeWindow={schedule.charge_window} dischargeWindow={schedule.discharge_window} />
        </div>
        <div className="space-y-3">
          <MetricCard label="Market Signal" value={currentSignal.toUpperCase()} variant={currentSignal === 'charge' ? 'success' : currentSignal === 'discharge' ? 'info' : 'warning'} />
          <MetricCard label="Confidence" value={schedule.confidence.replace(/_/g, ' ')} />
          <MetricCard label="Spread After RTE" value={schedule.spread_after_efficiency.toFixed(1)} unit="€/MWh" />
          <MetricCard label="Expected Value" value={`€${schedule.expected_value_range_eur[0]}-€${schedule.expected_value_range_eur[1]}`} />
          <div className="rounded-lg border border-border bg-surface-elevated/50 p-4">
            <p className="text-xs uppercase tracking-wider text-text-secondary">Reason</p>
            <p className="mt-2 text-sm leading-relaxed text-text-primary">
              Charge during {schedule.charge_window.start}-{schedule.charge_window.end}, then discharge during {schedule.discharge_window.start}-{schedule.discharge_window.end} if asset constraints remain acceptable.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
