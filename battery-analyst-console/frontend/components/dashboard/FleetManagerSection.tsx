'use client'

import React from 'react'
import { BatteryAction, BatteryAsset, FleetSummary } from '@/types/api'
import { BatteryAssetTable } from './BatteryAssetTable'
import { FleetBulkActions } from './FleetBulkActions'
import { FleetSummaryCards } from './FleetSummaryCards'

interface FleetManagerSectionProps {
  assets: BatteryAsset[]
  summary: FleetSummary
  selectedIds: string[]
  onSelectAll: () => void
  onClearSelection: () => void
  onToggleSelected: (id: string) => void
  onApplyAction: (action: BatteryAction) => void
  onAssetActionChange: (id: string, action: BatteryAction) => void
  onOpenAssetDetail?: (assetId: string) => void
}

export function FleetManagerSection({
  assets,
  summary,
  selectedIds,
  onSelectAll,
  onClearSelection,
  onToggleSelected,
  onApplyAction,
  onAssetActionChange,
  onOpenAssetDetail
}: FleetManagerSectionProps) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Battery Assets</h2>
        <p className="mt-1 text-sm text-text-secondary">Asset-level status, controls, and operating decisions.</p>
      </div>
      <FleetSummaryCards summary={summary} />
      <FleetBulkActions
        selectedCount={selectedIds.length}
        totalCount={assets.length}
        onSelectAll={onSelectAll}
        onClearSelection={onClearSelection}
        onApplyAction={onApplyAction}
      />
      <BatteryAssetTable
        assets={assets}
        selectedIds={selectedIds}
        onToggleSelected={onToggleSelected}
        onActionChange={onAssetActionChange}
        onOpenAssetDetail={onOpenAssetDetail}
      />
    </section>
  )
}
