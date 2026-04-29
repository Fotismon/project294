'use client'

import React from 'react'
import { BatteryAction } from '@/types/api'

interface FleetBulkActionsProps {
  selectedCount: number
  totalCount: number
  onSelectAll: () => void
  onClearSelection: () => void
  onApplyAction: (action: BatteryAction) => void
}

const actionButtons: Array<{ action: BatteryAction; label: string }> = [
  { action: 'auto', label: 'Apply Auto' },
  { action: 'charge', label: 'Apply Charge' },
  { action: 'discharge', label: 'Apply Discharge' },
  { action: 'idle', label: 'Apply Idle' }
]

export function FleetBulkActions({ selectedCount, totalCount, onSelectAll, onClearSelection, onApplyAction }: FleetBulkActionsProps) {
  const disabled = selectedCount === 0

  return (
    <div className="rounded-lg border border-border bg-surface-elevated/50 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-xs uppercase tracking-wider text-text-secondary">Fleet Bulk Actions</h3>
          <p className="mt-1 text-sm text-text-muted">
            {selectedCount} of {totalCount} assets selected
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onSelectAll} className="rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-text-primary hover:bg-surface-elevated">
            Select all
          </button>
          <button onClick={onClearSelection} className="rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-text-primary hover:bg-surface-elevated">
            Clear selection
          </button>
          {actionButtons.map((button) => (
            <button
              key={button.action}
              disabled={disabled}
              onClick={() => onApplyAction(button.action)}
              className="rounded-md border border-info/30 bg-info/10 px-3 py-2 text-xs font-medium text-info hover:bg-info/20 disabled:cursor-not-allowed disabled:border-border disabled:bg-surface disabled:text-text-muted"
            >
              {button.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
