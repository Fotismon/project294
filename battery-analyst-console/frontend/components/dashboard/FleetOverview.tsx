'use client'

import React from 'react'
import {
  Alert,
  BatteryAction,
  BatteryAsset,
  FleetRecommendation,
  FleetSummary,
  ForecastPoint,
  ScheduleResponse
} from '@/types/api'
import {
  ConfidenceBadge,
  DecisionBadge,
  EmptyState,
  MetricCard,
  SectionPanel,
  StressBadge
} from '@/components/ui'
import { BatteryAssetDetailPanel } from './BatteryAssetDetailPanel'
import { FleetAlertsPanel } from './FleetAlertsPanel'
import { FleetManagerSection } from './FleetManagerSection'
import { MarketForecastSection } from './MarketForecastSection'
import { OpinionatedRecommendationPanel } from './OpinionatedRecommendationPanel'
import { ProfitHealthComparisonCard } from './ProfitHealthComparisonCard'
import { RecommendationSection } from './RecommendationSection'
import { ScheduleTradeoffMatrix } from './ScheduleTradeoffMatrix'

interface FleetOverviewProps {
  schedule: ScheduleResponse
  forecastData: ForecastPoint[]
  fleetAssets: BatteryAsset[]
  alerts: Alert[]
  fleetSummary: FleetSummary
  fleetRecommendation: FleetRecommendation
  selectedAssetIds: string[]
  selectedAssetId: string | null
  selectedAsset: BatteryAsset | null
  onSelectAll: () => void
  onClearSelection: () => void
  onToggleSelected: (id: string) => void
  onApplyAction: (action: BatteryAction) => void
  onAssetActionChange: (id: string, action: BatteryAction) => void
  onOpenAssetDetail: (assetId: string) => void
  onCloseAssetDetail: () => void
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
  fleetRecommendation,
  selectedAssetIds,
  selectedAssetId,
  selectedAsset,
  onSelectAll,
  onClearSelection,
  onToggleSelected,
  onApplyAction,
  onAssetActionChange,
  onOpenAssetDetail,
  onCloseAssetDetail
}: FleetOverviewProps) {
  const hasAlerts = alerts.length > 0 || hasGeneratedAssetAlerts(fleetAssets)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-text-primary">Fleet Overview</h2>
        <p className="mt-1 text-sm text-text-secondary">Portfolio decision, market signal, asset actions, and operational risk.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 min-[1440px]:grid-cols-6">
        <MetricCard label="Decision" value={<DecisionBadge decision={schedule.decision} size="md" />} />
        <MetricCard label="Confidence" value={<ConfidenceBadge confidence={schedule.confidence} size="md" />} />
        <MetricCard label="Expected value" value={formatEuroRange(schedule.expected_value_range_eur)} tone="positive" />
        <MetricCard label="Spread after efficiency" value={formatSpread(schedule.spread_after_efficiency)} tone="info" />
        <MetricCard label="Fleet availability" value={`${fleetSummary.available_assets}/${fleetSummary.total_assets}`} helperText={`${formatPercent(fleetSummary.average_soc)} average SoC`} />
        <MetricCard label="Battery stress" value={<StressBadge level={schedule.battery_stress.level} score={schedule.battery_stress.score} size="md" />} />
      </div>

      <div className="grid grid-cols-1 gap-6 min-[1440px]:grid-cols-[minmax(0,2fr)_minmax(320px,0.9fr)]">
        <div className="space-y-6">
          {schedule.decision === 'hold' && (
            <RecommendationSection schedule={schedule} fleetRecommendation={fleetRecommendation} />
          )}

          <SectionPanel title="Market Forecast" subtitle="Price signal and recommended operating windows.">
            <MarketForecastSection
              forecastData={forecastData}
              schedule={schedule}
              currentSignal={fleetSummary.forecast_driven_action}
            />
          </SectionPanel>

          {schedule.decision !== 'hold' && (
            <RecommendationSection schedule={schedule} fleetRecommendation={fleetRecommendation} />
          )}

          <OpinionatedRecommendationPanel schedule={schedule} />

          <ProfitHealthComparisonCard schedule={schedule} />

          <ScheduleTradeoffMatrix schedule={schedule} />

          <SectionPanel title="Battery Assets" subtitle="Asset-level status, controls, and operating decision.">
            <FleetManagerSection
              assets={fleetAssets}
              summary={fleetSummary}
              selectedIds={selectedAssetIds}
              selectedAssetId={selectedAssetId}
              onSelectAll={onSelectAll}
              onClearSelection={onClearSelection}
              onToggleSelected={onToggleSelected}
              onApplyAction={onApplyAction}
              onAssetActionChange={onAssetActionChange}
              onOpenAssetDetail={onOpenAssetDetail}
            />
          </SectionPanel>
        </div>

        <div className="space-y-6">
          <BatteryAssetDetailPanel asset={selectedAsset} schedule={schedule} onClose={onCloseAssetDetail} />

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
    </div>
  )
}
