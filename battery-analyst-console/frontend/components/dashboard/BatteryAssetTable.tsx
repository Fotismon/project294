'use client'

import React from 'react'
import { BatteryAction, BatteryAsset, EffectiveBatteryAction } from '@/types/api'
import { BatteryActionSelector } from './BatteryActionSelector'
import { BatteryStatusBadge } from './BatteryStatusBadge'

interface BatteryAssetTableProps {
  assets: BatteryAsset[]
  selectedIds: string[]
  onToggleSelected: (id: string) => void
  onActionChange: (id: string, action: BatteryAction) => void
}

function effectiveAction(asset: BatteryAsset): EffectiveBatteryAction {
  return asset.selected_action === 'auto' ? asset.auto_action : asset.selected_action
}

function actionClass(action: EffectiveBatteryAction): string {
  if (action === 'charge') return 'bg-success/10 text-success border-success/30'
  if (action === 'discharge') return 'bg-info/10 text-info border-info/30'
  return 'bg-surface border-border text-text-secondary'
}

function stressClass(level: BatteryAsset['stress_level']): string {
  if (level === 'low') return 'text-success'
  if (level === 'medium') return 'text-warning'
  return 'text-error'
}

export function BatteryAssetTable({ assets, selectedIds, onToggleSelected, onActionChange }: BatteryAssetTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface-elevated/50">
      <div className="border-b border-border p-4">
        <h3 className="text-xs uppercase tracking-wider text-text-secondary">Battery Assets</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-surface text-xs uppercase tracking-wider text-text-muted">
            <tr>
              <th className="px-3 py-3">Select</th>
              <th className="px-3 py-3">Battery</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">SoC</th>
              <th className="px-3 py-3">Temp</th>
              <th className="px-3 py-3">Capacity</th>
              <th className="px-3 py-3">Power</th>
              <th className="px-3 py-3">Auto</th>
              <th className="px-3 py-3">Selected</th>
              <th className="px-3 py-3">Mode</th>
              <th className="px-3 py-3">Stress</th>
              <th className="px-3 py-3">Warnings</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {assets.map((asset) => {
              const effective = effectiveAction(asset)
              const isManual = asset.selected_action !== 'auto'

              return (
                <tr key={asset.id} className={isManual ? 'bg-warning/5' : undefined}>
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(asset.id)}
                      onChange={() => onToggleSelected(asset.id)}
                      className="h-4 w-4 accent-info"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-text-primary">{asset.name}</div>
                    <div className="text-xs text-text-muted">{asset.site}</div>
                  </td>
                  <td className="px-3 py-3">
                    <BatteryStatusBadge status={asset.status} />
                  </td>
                  <td className="px-3 py-3 text-text-primary">{Math.round(asset.soc * 100)}%</td>
                  <td className="px-3 py-3 text-text-primary">{asset.temperature_c} °C</td>
                  <td className="px-3 py-3 text-text-primary">{asset.capacity_mwh} MWh</td>
                  <td className="px-3 py-3 text-text-primary">{asset.power_mw} MW</td>
                  <td className="px-3 py-3">
                    <span className={`rounded border px-2 py-0.5 text-xs font-medium ${actionClass(asset.auto_action)}`}>{asset.auto_action}</span>
                  </td>
                  <td className="px-3 py-3">
                    <BatteryActionSelector value={asset.selected_action} onChange={(action) => onActionChange(asset.id, action)} disabled={asset.status === 'offline'} />
                    <p className="mt-1 text-xs text-text-muted">Effective: {effective}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`rounded border px-2 py-0.5 text-xs font-medium ${isManual ? 'border-warning/30 bg-warning/10 text-warning' : 'border-success/30 bg-success/10 text-success'}`}>
                      {isManual ? 'Manual override' : 'Auto'}
                    </span>
                  </td>
                  <td className={`px-3 py-3 font-medium ${stressClass(asset.stress_level)}`}>{asset.stress_level}</td>
                  <td className="px-3 py-3 text-xs text-text-secondary">
                    {asset.constraint_warnings.length > 0 ? asset.constraint_warnings.join('; ') : 'None'}
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
