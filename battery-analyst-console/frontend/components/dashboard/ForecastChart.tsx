'use client'

import React from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { ForecastPoint } from '@/types/api'
import { EmptyState } from '@/components/ui'

interface ForecastChartProps {
  data: ForecastPoint[]
  chargeWindow?: { start: string; end: string }
  dischargeWindow?: { start: string; end: string }
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

export function ForecastChart({ data, chargeWindow, dischargeWindow }: ForecastChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-[400px] w-full">
        <EmptyState title="No forecast data" message="Forecast data is unavailable." className="flex h-full flex-col items-center justify-center" />
      </div>
    )
  }

  const chartData = data
    .filter((point) => {
      const hour = new Date(point.timestamp).getHours()
      return hour >= 5 && hour <= 23
    })
    .map((point) => ({
      ...point,
      uncertainty_price: [point.p10_price, point.p90_price] as [number, number]
    }))

  const chargeStart = chargeWindow ? timestampForWindow(data, chargeWindow.start) : null
  const chargeEnd = chargeWindow ? timestampForWindow(data, chargeWindow.end) : null
  const dischargeStart = dischargeWindow ? timestampForWindow(data, dischargeWindow.start) : null
  const dischargeEnd = dischargeWindow ? timestampForWindow(data, dischargeWindow.end) : null

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: ForecastPoint }> }) => {
    if (!active || !payload?.length) return null
    const point = payload[0].payload

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
              point.action === 'charge'
                ? 'text-charge'
                : point.action === 'discharge'
                  ? 'text-discharge'
                  : 'text-text-muted'
            }`}
          >
            {point.action.toUpperCase()}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[400px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.28} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="uncertaintyGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#a1a1aa" stopOpacity={0.22} />
              <stop offset="95%" stopColor="#a1a1aa" stopOpacity={0.06} />
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
          <Tooltip content={<CustomTooltip />} />

          {chargeStart && chargeEnd && (
            <ReferenceArea x1={chargeStart} x2={chargeEnd} strokeOpacity={0} fill="#22c55e" fillOpacity={0.12} />
          )}
          {dischargeStart && dischargeEnd && (
            <ReferenceArea x1={dischargeStart} x2={dischargeEnd} strokeOpacity={0} fill="#ef4444" fillOpacity={0.12} />
          )}
          <Area
            type="monotone"
            dataKey="uncertainty_price"
            stroke="transparent"
            fill="url(#uncertaintyGradient)"
            fillOpacity={1}
            dot={false}
            activeDot={false}
          />
          <Area
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
            type="monotone"
            dataKey="actual_price"
            stroke="#e8e8ed"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
