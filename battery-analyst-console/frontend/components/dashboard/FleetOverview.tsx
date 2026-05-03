'use client'

import React from 'react'
import {
  Alert,
  BatteryAction,
  BatteryAsset,
  FleetSummary,
  ForecastPoint,
  ScheduleResponse
} from '@/types/api'
import {
  ConfidenceBadge,
  EmptyState,
  MetricCard,
  SectionPanel,
  StatusBadge
} from '@/components/ui'
import { AlternativesPanel } from './AlternativesPanel'
import { ConstraintPanel } from './ConstraintPanel'
import { FleetAlertsPanel } from './FleetAlertsPanel'
import { MarketForecastSection } from './MarketForecastSection'
import { OptimizerBadge } from './OptimizerBadge'
import { ProfitHealthComparisonCard } from './ProfitHealthComparisonCard'
import { ScheduleTradeoffMatrix } from './ScheduleTradeoffMatrix'
import { SoCFeasibilityCard } from './SoCFeasibilityCard'
import { ValueDiagnosticsPanel } from './ValueDiagnosticsPanel'

interface FleetOverviewProps {
  schedule: ScheduleResponse
  forecastData: ForecastPoint[]
  fleetAssets: BatteryAsset[]
  alerts: Alert[]
  fleetSummary: FleetSummary
  avgBandWidth?: number | null
}

function formatEuro(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
    style: 'currency',
    currency: 'EUR'
  }).format(value)
}

function formatEuroRange(range: [number, number] | number[]): string {
  const low = range[0] ?? 0
  const high = range[1] ?? low
  return `${formatEuro(low)}-${formatEuro(high)}`
}

function formatSpread(value: number): string {
  return `${value.toFixed(2)} EUR/MWh`
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function effectiveAction(asset: BatteryAsset): Exclude<BatteryAction, 'auto'> {
  return asset.selected_action === 'auto' ? asset.auto_action : asset.selected_action
}

function hasGeneratedAssetAlerts(assets: BatteryAsset[]): boolean {
  const dischargingCount = assets.filter((asset) => effectiveAction(asset) === 'discharge').length

  return assets.some((asset) => {
    const action = effectiveAction(asset)
    return (
      asset.status === 'offline' ||
      asset.temperature_c >= 33 ||
      (asset.selected_action !== 'auto' && asset.selected_action !== asset.auto_action) ||
      (action === 'discharge' && asset.soc < 0.25) ||
      (asset.stress_level === 'high' && action !== 'idle')
    )
  }) || dischargingCount > Math.ceil(assets.length / 2)
}

export function FleetOverview({
  schedule,
  forecastData,
  fleetAssets,
  alerts,
  fleetSummary,
  avgBandWidth
}: FleetOverviewProps) {
  const hasAlerts = alerts.length > 0 || hasGeneratedAssetAlerts(fleetAssets)
  const singleProfileValue = schedule.single_profile_expected_value_range_eur ?? schedule.expected_value_range_eur
  const fleetValue = schedule.fleet_economics?.fleet_expected_value_range_eur ?? schedule.expected_value_range_eur
  const valueMidpoint = Math.round(((fleetValue[0] ?? 0) + (fleetValue[1] ?? fleetValue[0] ?? 0)) / 2)
  const confidenceBand = Math.round(Math.abs((fleetValue[1] ?? 0) - (fleetValue[0] ?? 0)) / 2)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary">Today's Plan</h2>
          <p className="mt-1 text-sm text-text-secondary">Forecast curve, MILP dispatch, SoC trajectory, and expected P&L.</p>
        </div>
        <OptimizerBadge optimizer={schedule.optimizer} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <MetricCard
          label="Expected P&L today"
          value={formatEuro(valueMidpoint)}
          helperText={`Confidence: +/-${formatEuro(confidenceBand)}`}
          tone={valueMidpoint >= 0 ? 'positive' : 'warning'}
        />
        <MetricCard
          label="Cycles planned"
          value={schedule.diagnostics ? schedule.diagnostics.equivalent_full_cycles.toFixed(2) : '0.00'}
          helperText={`${schedule.diagnostics?.total_mwh_discharged.toFixed(1) ?? '0.0'} MWh discharged`}
          tone="info"
        />
        <MetricCard
          label="Athens market day"
          value={schedule.date}
          helperText="Europe/Athens timezone"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 min-[1440px]:grid-cols-7">
        <MetricCard label="Decision" value={<FleetDecisionBadge decision={schedule.decision} />} />
        <MetricCard label="Confidence" value={<ConfidenceBadge confidence={schedule.confidence} size="md" />} />
        <MetricCard label="Fleet value" value={formatEuroRange(fleetValue)} helperText={`${schedule.fleet_economics?.active_battery_count ?? fleetSummary.available_assets} active batteries`} tone="positive" />
        <MetricCard label="Single-profile value" value={formatEuroRange(singleProfileValue)} tone="info" />
        <MetricCard label="Spread after efficiency" value={formatSpread(schedule.spread_after_efficiency)} tone="info" />
        <MetricCard label="Fleet availability" value={`${fleetSummary.available_assets}/${fleetSummary.total_assets}`} helperText={`${formatPercent(fleetSummary.average_soc)} average SoC`} />
      </div>

      <div className="space-y-6">
        <MarketForecastSection
          forecastData={forecastData}
          schedule={schedule}
          avgBandWidth={avgBandWidth}
        />

        <ProfitHealthComparisonCard schedule={schedule} />

        <ScheduleTradeoffMatrix schedule={schedule} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ConstraintPanel constraints={schedule.physical_constraints} />
          <SoCFeasibilityCard feasibility={schedule.soc_feasibility} />
        </div>

        <AlternativesPanel alternatives={schedule.alternatives} />

        <ValueDiagnosticsPanel
          provenance={schedule.forecast_provenance}
          diagnostics={schedule.price_spread_diagnostics}
        />

        <SectionPanel title="Operational Alerts" subtitle="Risks from the latest schedule or scenario.">
          {hasAlerts ? (
            <FleetAlertsPanel alerts={alerts} assets={fleetAssets} />
          ) : (
            <EmptyState
              title="No active alerts"
              message="No operational alerts were returned by the latest schedule or scenario."
            />
          )}
        </SectionPanel>
      </div>
    </div>
  )
}

function FleetDecisionBadge({ decision }: { decision: ScheduleResponse['decision'] }) {
  if (decision === 'execute') {
    return <StatusBadge label="Charge" tone="positive" size="md" dot />
  }
  if (decision === 'execute_with_caution') {
    return <StatusBadge label="Charge with caution" tone="warning" size="md" dot />
  }
  if (decision === 'watch') {
    return <StatusBadge label="Watch" tone="info" size="md" dot />
  }
  return <StatusBadge label="Hold" tone="critical" size="md" dot />
}
