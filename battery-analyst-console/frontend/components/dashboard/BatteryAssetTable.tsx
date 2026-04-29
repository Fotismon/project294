'use client'

import React from 'react'
import { BatteryAction, BatteryAsset, EffectiveBatteryAction } from '@/types/api'
import { EmptyState, StatusBadge, StressBadge } from '@/components/ui'
import { BatteryActionSelector } from './BatteryActionSelector'

interface BatteryAssetTableProps {
  assets: BatteryAsset[]
  selectedIds: string[]
  onToggleSelected: (id: string) => void
  onActionChange: (id: string, action: BatteryAction) => void
  onOpenAssetDetail?: (assetId: string) => void
}

function effectiveAction(asset: BatteryAsset): EffectiveBatteryAction {
  return asset.selected_action === 'auto' ? asset.auto_action : asset.selected_action
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatTemperature(value: number): string {
  return `${value}°C`
}

function formatEuro(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
    style: 'currency',
    currency: 'EUR'
  }).format(value)
}

function formatEuroRange(range: [number, number]): string {
  return `${formatEuro(range[0])}-${formatEuro(range[1])}`
}

function statusTone(status: BatteryAsset['status']): 'positive' | 'warning' | 'critical' {
  if (status === 'available') return 'positive'
  if (status === 'limited') return 'warning'
  return 'critical'
}

function actionTone(action: BatteryAction | EffectiveBatteryAction): 'neutral' | 'positive' | 'warning' | 'info' {
  if (action === 'charge') return 'info'
  if (action === 'discharge') return 'warning'
  if (action === 'idle') return 'neutral'
  return 'positive'
}

function temperatureTone(value: number): 'neutral' | 'positive' | 'warning' | 'critical' {
  if (value >= 40) return 'critical'
  if (value >= 30) return 'warning'
  return 'positive'
}

function actionLabel(action: BatteryAction | EffectiveBatteryAction): string {
  return action.charAt(0).toUpperCase() + action.slice(1)
}

function socTone(value: number): string {
  if (value < 0.2 || value > 0.9) return 'bg-warning'
  return 'bg-info'
}

export function BatteryAssetTable({
  assets,
  selectedIds,
  onToggleSelected,
  onActionChange,
  onOpenAssetDetail
}: BatteryAssetTableProps) {
  if (assets.length === 0) {
    return (
      <EmptyState
        title="No battery assets"
        message="Add battery assets to review asset-level operating decisions."
      />
    )
  }

  return (
    <div className="border border-border bg-surface-elevated/50">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1280px] text-left text-sm">
          <thead className="border-b border-border bg-surface text-xs uppercase tracking-wider text-text-muted">
            <tr>
              <th className="w-12 px-3 py-3">Select</th>
              <th className="px-3 py-3">Asset</th>
              <th className="px-3 py-3">Site</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">SoC</th>
              <th className="px-3 py-3">Temperature</th>
              <th className="px-3 py-3">Stress</th>
              <th className="px-3 py-3">Auto action</th>
              <th className="px-3 py-3">Selected action</th>
              <th className="px-3 py-3">Expected value</th>
              <th className="px-3 py-3">Warnings</th>
              <th className="px-3 py-3">Open detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {assets.map((asset) => {
              const selected = selectedIds.includes(asset.id)
              const effective = effectiveAction(asset)
              const isManual = asset.selected_action !== 'auto'
              const warningCount = asset.constraint_warnings.length
              const firstWarning = asset.constraint_warnings[0]
              const detailEnabled = Boolean(onOpenAssetDetail)

              return (
                <tr key={asset.id} className={`transition hover:bg-surface ${isManual ? 'bg-warning/5' : ''}`}>
                  <td className="px-3 py-3 align-top">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggleSelected(asset.id)}
                      className="h-4 w-4 accent-info"
                      aria-label={`Select ${asset.name}`}
                    />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="font-medium text-text-primary">{asset.name}</div>
                    <div className="mt-0.5 text-xs text-text-muted">{asset.id}</div>
                  </td>
                  <td className="px-3 py-3 align-top text-text-secondary">{asset.site}</td>
                  <td className="px-3 py-3 align-top">
                    <StatusBadge label={asset.status.toUpperCase()} tone={statusTone(asset.status)} dot />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="w-24">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-text-primary">{formatPercent(asset.soc)}</span>
                      </div>
                      <div className="mt-2 h-1.5 bg-border">
                        <div className={`h-1.5 ${socTone(asset.soc)}`} style={{ width: `${Math.min(100, Math.max(0, asset.soc * 100))}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <StatusBadge label={formatTemperature(asset.temperature_c)} tone={temperatureTone(asset.temperature_c)} />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <StressBadge level={asset.stress_level} />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <StatusBadge label={actionLabel(asset.auto_action)} tone={actionTone(asset.auto_action)} dot />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="min-w-32">
                      <BatteryActionSelector
                        value={asset.selected_action}
                        onChange={(action) => onActionChange(asset.id, action)}
                        disabled={asset.status === 'offline'}
                      />
                      <div className="mt-1 flex flex-wrap gap-1">
                        <StatusBadge label={`Effective: ${actionLabel(effective)}`} tone={actionTone(effective)} />
                        {isManual && <StatusBadge label="Manual" tone="warning" />}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top font-medium text-text-primary">{formatEuroRange(asset.expected_value_eur)}</td>
                  <td className="px-3 py-3 align-top">
                    {warningCount > 0 ? (
                      <div className="max-w-[240px]">
                        <StatusBadge label={`${warningCount} warning${warningCount === 1 ? '' : 's'}`} tone="warning" />
                        <p className="mt-1 truncate text-xs text-text-secondary" title={asset.constraint_warnings.join('; ')}>
                          {firstWarning}
                        </p>
                      </div>
                    ) : (
                      <StatusBadge label="None" tone="positive" />
                    )}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <button
                      type="button"
                      disabled={!detailEnabled}
                      onClick={() => onOpenAssetDetail?.(asset.id)}
                      title={detailEnabled ? `Open ${asset.name}` : 'Asset detail coming next.'}
                      className="border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition hover:bg-surface-elevated disabled:cursor-not-allowed disabled:text-text-muted"
                    >
                      Open
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
