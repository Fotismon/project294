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
  selectedAssetId?: string | null
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
  selectedAssetId,
  onSelectAll,
  onClearSelection,
  onToggleSelected,
  onApplyAction,
  onAssetActionChange,
  onOpenAssetDetail
}: FleetManagerSectionProps) {
  return (
    <section className="space-y-4">
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
        selectedAssetId={selectedAssetId}
        onToggleSelected={onToggleSelected}
        onActionChange={onAssetActionChange}
        onOpenAssetDetail={onOpenAssetDetail}
      />
    </section>
  )
}
