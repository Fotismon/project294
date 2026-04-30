'use client'

import React from 'react'
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { ForecastPoint, ScheduleResponse } from '@/types/api'
import { EmptyState } from '@/components/ui'

interface ForecastChartProps {
  data: ForecastPoint[]
  chargeWindow?: { start: string; end: string }
  dischargeWindow?: { start: string; end: string }
  schedule?: ScheduleResponse
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Athens'
  })
}

function timestampForWindow(data: ForecastPoint[], time: string): string {
  const date = data[0]?.timestamp.slice(0, 10) ?? '2026-04-29'
  return `${date}T${time}:00`
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function windowDurationHours(window?: { start: string; end: string }): number {
  if (!window || window.start === window.end) return 0
  return Math.max(0, (timeToMinutes(window.end) - timeToMinutes(window.start)) / 60)
}

function pointMinutes(timestamp: string): number {
  const time = formatTime(timestamp)
  return timeToMinutes(time)
}

function isInWindow(timestamp: string, window?: { start: string; end: string }): boolean {
  if (!window || window.start === window.end) return false
  const current = pointMinutes(timestamp)
  return current >= timeToMinutes(window.start) && current < timeToMinutes(window.end)
}

function progressionWithinWindow(timestamp: string, window?: { start: string; end: string }): number | null {
  if (!window || window.start === window.end) return null
  const start = timeToMinutes(window.start)
  const end = timeToMinutes(window.end)
  const current = pointMinutes(timestamp)
  if (current < start) return 0
  if (current >= end) return 1
  return (current - start) / Math.max(1, end - start)
}

function estimatedPowerMw(totalMwh: number | undefined, durationHours: number): number {
  if (!totalMwh || durationHours <= 0) return 100
  return Math.round((totalMwh / durationHours) * 10) / 10
}

function socForPoint(timestamp: string, schedule?: ScheduleResponse): number | null {
  if (!schedule) return null
  const startSoc = schedule.soc_feasibility.start_soc
  const endSoc = schedule.soc_feasibility.end_soc
  const maxSoc = Math.max(startSoc, schedule.soc_feasibility.max_soc)
  const chargeProgress = progressionWithinWindow(timestamp, schedule.charge_window)
  const dischargeProgress = progressionWithinWindow(timestamp, schedule.discharge_window)

  if (chargeProgress !== null && chargeProgress < 1) {
    return Math.round((startSoc + (maxSoc - startSoc) * chargeProgress) * 1000) / 10
  }
  if (dischargeProgress !== null && dischargeProgress < 1) {
    return Math.round((maxSoc - (maxSoc - endSoc) * dischargeProgress) * 1000) / 10
  }
  if (dischargeProgress === 1) return Math.round(endSoc * 1000) / 10
  if (chargeProgress === 1) return Math.round(maxSoc * 1000) / 10
  return Math.round(startSoc * 1000) / 10
}

export function ForecastChart({ data, chargeWindow, dischargeWindow, schedule }: ForecastChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-[400px] w-full">
        <EmptyState title="No forecast data" message="Forecast data is unavailable." className="flex h-full flex-col items-center justify-center" />
      </div>
    )
  }

  const chargePower = estimatedPowerMw(schedule?.diagnostics?.total_mwh_charged, windowDurationHours(chargeWindow))
  const dischargePower = estimatedPowerMw(schedule?.diagnostics?.total_mwh_discharged, windowDurationHours(dischargeWindow))
  const chartData = data
    .map((point) => ({
      ...point,
      uncertainty_price: [point.p10_price, point.p90_price] as [number, number],
      charge_dispatch_mw: isInWindow(point.timestamp, chargeWindow) ? -chargePower : 0,
      discharge_dispatch_mw: isInWindow(point.timestamp, dischargeWindow) ? dischargePower : 0,
      soc_percent: socForPoint(point.timestamp, schedule),
      scheduled_action: isInWindow(point.timestamp, chargeWindow)
        ? 'charge'
        : isInWindow(point.timestamp, dischargeWindow)
          ? 'discharge'
          : 'idle',
    }))

  const chargeStart = chargeWindow ? timestampForWindow(data, chargeWindow.start) : null
  const chargeEnd = chargeWindow ? timestampForWindow(data, chargeWindow.end) : null
  const dischargeStart = dischargeWindow ? timestampForWindow(data, dischargeWindow.start) : null
  const dischargeEnd = dischargeWindow ? timestampForWindow(data, dischargeWindow.end) : null

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: ForecastPoint & { scheduled_action?: string; soc_percent?: number } }> }) => {
    if (!active || !payload?.length) return null
    const point = payload[0].payload
    const action = point.scheduled_action ?? 'idle'
    const priceText = `${point.p50_price.toFixed(1)} €/MWh`
    const topShap = point.shap_explanation?.top_contributions?.slice(0, 3) ?? []
    const scheduleReason = action === 'charge'
      ? `Charge at ${formatTime(point.timestamp)} because this interval sits inside the low-price window before the planned discharge.`
      : action === 'discharge'
        ? `Discharge at ${formatTime(point.timestamp)} because ${priceText} clears the selected charge cost after efficiency; spread after efficiency is ${schedule?.spread_after_efficiency.toFixed(1) ?? '-'} €/MWh.`
        : 'No dispatch in this interval; MILP reserves energy for higher-value intervals or preserves constraints.'

    return (
      <div className="rounded-lg border border-border bg-surface-elevated p-3 shadow-lg">
        <p className="mb-1 text-xs text-text-secondary">{formatTime(point.timestamp)}</p>
        <div className="space-y-1">
          <p className="text-sm text-text-primary">
            P50: <span className="font-semibold">{point.p50_price.toFixed(1)} €/MWh</span>
          </p>
          <p className="text-xs text-text-muted">
            Range: {point.p10_price.toFixed(1)}-{point.p90_price.toFixed(1)} €/MWh
          </p>
          {point.actual_price !== null && (
            <p className="text-xs text-text-primary">Actual: {point.actual_price.toFixed(1)} €/MWh</p>
          )}
          <p
            className={`text-xs font-medium ${
              action === 'charge'
                ? 'text-charge'
                : action === 'discharge'
                  ? 'text-discharge'
                  : 'text-text-muted'
            }`}
          >
            {action.toUpperCase()}
          </p>
          {point.soc_percent != null && <p className="text-xs text-text-secondary">Estimated SoC: {point.soc_percent.toFixed(1)}%</p>}
          <p className="max-w-xs pt-1 text-xs leading-relaxed text-text-secondary">{scheduleReason}</p>
          {topShap.length > 0 && (
            <div className="mt-2 border-t border-border pt-2">
              <p className="text-xs uppercase tracking-wider text-text-muted">Top model drivers</p>
              <ul className="mt-1 space-y-1">
                {topShap.map((driver) => (
                  <li key={`${driver.feature}-${driver.contribution_eur_per_mwh}`} className="flex justify-between gap-3 text-xs">
                    <span className="max-w-[180px] truncate text-text-secondary">{driver.feature}</span>
                    <span className={driver.direction === 'up' ? 'text-success' : 'text-error'}>
                      {driver.contribution_eur_per_mwh > 0 ? '+' : ''}{driver.contribution_eur_per_mwh.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-[520px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 20, right: 42, left: 20, bottom: 20 }}>
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.28} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="uncertaintyGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#a1a1aa" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#a1a1aa" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" vertical={false} />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatTime}
            stroke="#686878"
            tick={{ fill: '#9898a8', fontSize: 11 }}
            axisLine={{ stroke: '#2a2a3a' }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            yAxisId="price"
            stroke="#686878"
            tick={{ fill: '#9898a8', fontSize: 11 }}
            axisLine={{ stroke: '#2a2a3a' }}
            tickLine={false}
            tickFormatter={(value) => `${value}`}
            label={{
              value: '€/MWh',
              angle: -90,
              position: 'insideLeft',
              style: { fill: '#686878', fontSize: 12 }
            }}
          />
          <YAxis
            yAxisId="soc"
            orientation="right"
            domain={[0, 100]}
            stroke="#f59e0b"
            tick={{ fill: '#f59e0b', fontSize: 11 }}
            axisLine={{ stroke: '#2a2a3a' }}
            tickLine={false}
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} yAxisId="price" stroke="#686878" strokeOpacity={0.5} />

          {chargeStart && chargeEnd && (
            <ReferenceArea x1={chargeStart} x2={chargeEnd} yAxisId="price" strokeOpacity={0} fill="#3b82f6" fillOpacity={0.1} />
          )}
          {dischargeStart && dischargeEnd && (
            <ReferenceArea x1={dischargeStart} x2={dischargeEnd} yAxisId="price" strokeOpacity={0} fill="#f59e0b" fillOpacity={0.12} />
          )}
          <Bar yAxisId="price" dataKey="charge_dispatch_mw" fill="#3b82f6" fillOpacity={0.75} barSize={4} />
          <Bar yAxisId="price" dataKey="discharge_dispatch_mw" fill="#f59e0b" fillOpacity={0.75} barSize={4} />
          <Area
            yAxisId="price"
            type="monotone"
            dataKey="uncertainty_price"
            stroke="transparent"
            fill="url(#uncertaintyGradient)"
            fillOpacity={1}
            dot={false}
            activeDot={false}
          />
          <Area
            yAxisId="price"
            type="monotone"
            dataKey="p50_price"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#priceGradient)"
            fillOpacity={0.32}
            dot={false}
            activeDot={{ r: 4, fill: '#3b82f6', stroke: '#0a0a0f', strokeWidth: 2 }}
          />
          <Line
            yAxisId="price"
            type="monotone"
            dataKey="actual_price"
            stroke="#e8e8ed"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />
          <Line
            yAxisId="soc"
            type="monotone"
            dataKey="soc_percent"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
