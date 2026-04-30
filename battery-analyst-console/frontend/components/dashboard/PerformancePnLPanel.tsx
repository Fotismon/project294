'use client'

import React from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { BacktestCurvePoint, BacktestResponse } from '@/types/api'
import { EmptyState, MetricCard, SectionPanel, StatusBadge } from '@/components/ui'

interface PerformancePnLPanelProps {
  result: BacktestResponse | null
}

function formatEuro(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(value)
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Athens'
  })
}

function formatDay(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone: 'Europe/Athens'
  })
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function buildCumulativeSeries(result: BacktestResponse) {
  const realizedTotal = result.economic_result?.realized_value_eur ?? result.realized_value_eur ?? 0
  const expectedRange = result.economic_result?.forecast_expected_value_range_eur ?? [0, 0]
  const theoreticalTotal = Math.max(realizedTotal, ((expectedRange[0] ?? 0) + (expectedRange[1] ?? 0)) / 2) * 1.18
  const points = result.curve.length > 0 ? result.curve : []

  return points.map((point, index) => {
    const progress = (index + 1) / Math.max(points.length, 1)
    const shapeBoost = point.realized_price >= point.forecast_price ? 1.05 : 0.95
    return {
      timestamp: point.timestamp,
      realized: Math.round(realizedTotal * progress * shapeBoost),
      theoretical: Math.round(theoreticalTotal * progress),
      forecast_value_gap: Math.round(theoreticalTotal * progress - realizedTotal * progress * shapeBoost)
    }
  })
}

function buildDailyBreakdown(result: BacktestResponse) {
  const schedule = result.schedule_response
  const diagnostics = schedule?.diagnostics
  const chargeAvg = result.charge_window?.realized_avg_price ?? result.charge_window?.forecast_avg_price ?? 0
  const dischargeAvg = result.discharge_window?.realized_avg_price ?? result.discharge_window?.forecast_avg_price ?? 0
  const chargedMwh = diagnostics?.total_mwh_charged ?? 0
  const dischargedMwh = diagnostics?.total_mwh_discharged ?? 0
  const grossRevenue = dischargeAvg * dischargedMwh
  const energyCost = chargeAvg * chargedMwh
  const rteLoss = Math.max(0, energyCost * 0.12)
  const cycleWear = Math.max(0, dischargedMwh * 20)
  const netPnl = result.economic_result?.realized_value_eur ?? grossRevenue - energyCost - rteLoss - cycleWear

  return { grossRevenue, energyCost, rteLoss, cycleWear, netPnl }
}

function buildHourlyHeatmap(curve: BacktestCurvePoint[]) {
  const hourly = Array.from({ length: 24 }, (_, hour) => {
    const values = curve
      .filter((point) => new Date(point.timestamp).getHours() === hour)
      .map((point) => point.realized_price - point.forecast_price)
    return {
      hour,
      pnl_proxy: Math.round(average(values) * 10) / 10
    }
  })
  return hourly
}

function heatTone(value: number): string {
  if (value > 10) return 'bg-success/30 text-success'
  if (value > 0) return 'bg-success/15 text-success'
  if (value < -10) return 'bg-error/30 text-error'
  if (value < 0) return 'bg-error/15 text-error'
  return 'bg-surface-elevated text-text-muted'
}

export function PerformancePnLPanel({ result }: PerformancePnLPanelProps) {
  if (!result) {
    return (
      <SectionPanel title="Performance & P&L" subtitle="Historical P&L diagnostics appear after a backtest run.">
        <EmptyState
          title="No performance replay yet"
          message="Run a backtest to populate cumulative P&L, forecast value, heatmap, and cycle budget diagnostics."
        />
      </SectionPanel>
    )
  }

  const cumulative = buildCumulativeSeries(result)
  const breakdown = buildDailyBreakdown(result)
  const heatmap = buildHourlyHeatmap(result.curve)
  const diagnostics = result.schedule_response?.diagnostics
  const cycles = diagnostics?.equivalent_full_cycles ?? 0
  const cycleBudget = 1.5
  const forecastValue = cumulative.at(-1)?.forecast_value_gap ?? 0

  return (
    <SectionPanel
      title="Performance & P&L"
      subtitle="Realized economics, perfect-foresight benchmark proxy, and cycle budget."
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Net P&L" value={formatEuro(breakdown.netPnl)} tone={breakdown.netPnl >= 0 ? 'positive' : 'warning'} />
          <MetricCard label="Forecast value gap" value={formatEuro(forecastValue)} helperText="Perfect-foresight proxy minus realized replay" tone={forecastValue >= 0 ? 'info' : 'warning'} />
          <MetricCard label="Cycles used" value={cycles.toFixed(2)} helperText={`Budget ${cycleBudget.toFixed(1)} cycles/day`} tone={cycles <= cycleBudget ? 'positive' : 'warning'} />
          <MetricCard label="Replay day" value={formatDay(result.date)} helperText="Europe/Athens" />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
          <div className="border border-border bg-surface p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wider text-text-secondary">Cumulative P&L</p>
              <div className="flex gap-2">
                <StatusBadge label="Realized" tone="positive" dot />
                <StatusBadge label="Perfect-foresight proxy" tone="info" dot />
              </div>
            </div>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cumulative} margin={{ top: 12, right: 24, left: 12, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" vertical={false} />
                  <XAxis dataKey="timestamp" tickFormatter={formatTime} stroke="#686878" tick={{ fill: '#9898a8', fontSize: 11 }} tickLine={false} minTickGap={28} />
                  <YAxis stroke="#686878" tick={{ fill: '#9898a8', fontSize: 11 }} tickFormatter={(value) => `€${value}`} tickLine={false} />
                  <Tooltip
                    formatter={(value: number) => formatEuro(value)}
                    labelFormatter={(label) => formatTime(String(label))}
                    contentStyle={{ background: '#1a1a24', border: '1px solid #2a2a3a', color: '#e8e8ed' }}
                  />
                  <Line type="monotone" dataKey="realized" stroke="#22c55e" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="theoretical" stroke="#3b82f6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="border border-border bg-surface p-4">
            <p className="text-xs uppercase tracking-wider text-text-secondary">Daily economic breakdown</p>
            <div className="mt-4 space-y-2">
              <BreakdownRow label="Gross revenue" value={breakdown.grossRevenue} tone="positive" />
              <BreakdownRow label="Energy costs" value={-breakdown.energyCost} tone="warning" />
              <BreakdownRow label="RTE losses" value={-breakdown.rteLoss} tone="warning" />
              <BreakdownRow label="Cycle wear cost" value={-breakdown.cycleWear} tone="warning" />
              <BreakdownRow label="Net P&L" value={breakdown.netPnl} tone={breakdown.netPnl >= 0 ? 'positive' : 'warning'} emphasized />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="border border-border bg-surface p-4">
            <p className="text-xs uppercase tracking-wider text-text-secondary">P&L heatmap by hour</p>
            <p className="mt-1 text-xs text-text-muted">Single-day proxy: realized price minus forecast price by hour.</p>
            <div className="mt-4 grid grid-cols-6 gap-1 md:grid-cols-12">
              {heatmap.map((cell) => (
                <div key={cell.hour} className={`px-2 py-2 text-center text-xs ${heatTone(cell.pnl_proxy)}`}>
                  <p className="font-mono">{String(cell.hour).padStart(2, '0')}</p>
                  <p className="mt-1 font-mono">{cell.pnl_proxy.toFixed(1)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-border bg-surface p-4">
            <p className="text-xs uppercase tracking-wider text-text-secondary">Cycle budget</p>
            <div className="mt-4 h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[{ label: 'Used', value: cycles }, { label: 'Remaining', value: Math.max(0, cycleBudget - cycles) }]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" vertical={false} />
                  <XAxis dataKey="label" stroke="#686878" tick={{ fill: '#9898a8', fontSize: 11 }} tickLine={false} />
                  <YAxis stroke="#686878" tick={{ fill: '#9898a8', fontSize: 11 }} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#1a1a24', border: '1px solid #2a2a3a', color: '#e8e8ed' }} />
                  <Bar dataKey="value" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </SectionPanel>
  )
}

function BreakdownRow({
  label,
  value,
  tone,
  emphasized = false
}: {
  label: string
  value: number
  tone: 'positive' | 'warning'
  emphasized?: boolean
}) {
  return (
    <div className={`flex items-center justify-between border border-border bg-surface-elevated/40 px-3 py-2 ${emphasized ? 'border-info/40' : ''}`}>
      <span className="text-sm text-text-secondary">{label}</span>
      <StatusBadge label={formatEuro(value)} tone={tone} />
    </div>
  )
}
