'use client'

import React from 'react'
import { BatteryAction, BatteryAsset, EffectiveBatteryAction, ScheduleResponse } from '@/types/api'
import {
  ConfidenceBadge,
  DecisionBadge,
  EmptyState,
  MetricCard,
  SectionPanel,
  StatusBadge,
  StressBadge
} from '@/components/ui'

interface BatteryAssetDetailPanelProps {
  asset: BatteryAsset | null
  schedule: ScheduleResponse
  onClose: () => void
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatEuroRange(range: [number, number] | number[]): string {
  const low = range[0] ?? 0
  const high = range[1] ?? low
  return `€${low}-€${high}`
}

function formatWindow(start: string, end: string): string {
  if (start === end) return 'No window'
  return `${start}-${end}`
}

function actionLabel(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
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
  return 'neutral'
}

function temperatureTone(value: number): 'neutral' | 'positive' | 'warning' | 'critical' {
  if (value >= 40) return 'critical'
  if (value >= 30) return 'warning'
  return 'positive'
}

function effectiveAction(asset: BatteryAsset): EffectiveBatteryAction {
  if (asset.status === 'offline') return 'idle'
  return asset.selected_action === 'auto' ? asset.auto_action : asset.selected_action
}

function buildWarnings(asset: BatteryAsset, schedule: ScheduleResponse): string[] {
  const warnings = [...asset.constraint_warnings]

  if (asset.selected_action !== 'auto' && asset.selected_action !== asset.auto_action) {
    warnings.push('Manual override differs from the automatic recommendation.')
  }

  if (asset.status === 'offline') {
    warnings.push('Offline asset should not be dispatched.')
  }

  if (asset.temperature_c >= 30) {
    warnings.push(`Asset temperature is ${asset.temperature_c} °C; monitor thermal risk before dispatch.`)
  }

  schedule.alerts
    .filter((alert) => alert.severity === 'critical' || alert.severity === 'warning')
    .slice(0, 2)
    .forEach((alert) => warnings.push(`${alert.title}: ${alert.message}`))

  return Array.from(new Set(warnings))
}

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border pt-4">
      <h4 className="mb-3 text-xs uppercase tracking-wider text-text-secondary">{title}</h4>
      {children}
    </div>
  )
}

export function BatteryAssetDetailPanel({ asset, schedule, onClose }: BatteryAssetDetailPanelProps) {
  if (!asset) {
    return (
      <SectionPanel title="Battery Asset Detail" subtitle="Second-level inspection for one selected asset.">
        <EmptyState
          title="No battery selected"
          message="Select an asset from the table to inspect asset-level recommendation context."
        />
      </SectionPanel>
    )
  }

  const assetEffectiveAction = effectiveAction(asset)
  const warnings = buildWarnings(asset, schedule)
  const scheduleHold = schedule.decision === 'hold'
  const stressReasons = schedule.battery_stress.reasons.slice(0, 3)

  return (
    <SectionPanel
      title="Battery Asset Detail"
      subtitle={`${asset.name} · ${asset.site}`}
      action={
        <button
          type="button"
          onClick={onClose}
          className="border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
        >
          Close detail
        </button>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={asset.status.toUpperCase()} tone={statusTone(asset.status)} dot />
            <StressBadge level={asset.stress_level} />
            <StatusBadge label={`ID ${asset.id}`} tone="neutral" />
          </div>
          <p className="mt-3 text-sm leading-relaxed text-text-secondary">
            This asset-level view maps the fleet recommendation to the selected battery. Per-asset optimization is approximated until fleet scheduling is implemented.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <MetricCard label="State of charge" value={formatPercent(asset.soc)} helperText="Current asset SoC" tone={asset.soc < 0.2 ? 'warning' : 'info'} />
          <MetricCard label="Capacity" value={`${asset.capacity_mwh} MWh`} />
          <MetricCard label="Power" value={`${asset.power_mw} MW`} />
          <MetricCard label="Temperature" value={`${asset.temperature_c} °C`} tone={temperatureTone(asset.temperature_c)} />
          <MetricCard label="Asset expected value" value={formatEuroRange(asset.expected_value_eur)} tone="positive" className="sm:col-span-2" />
        </div>

        <DetailBlock title="Recommended Action">
          <div className="space-y-3">
            <p className="text-sm font-medium text-text-primary">Recommended asset action: {actionLabel(asset.status === 'offline' ? 'idle' : asset.auto_action)}</p>
            <div className="flex flex-wrap gap-2">
              <StatusBadge label={`Auto: ${actionLabel(asset.auto_action)}`} tone={actionTone(asset.auto_action)} dot />
              <StatusBadge label={`Selected: ${actionLabel(asset.selected_action)}`} tone={actionTone(asset.selected_action)} />
              <StatusBadge label={`Effective: ${actionLabel(assetEffectiveAction)}`} tone={actionTone(assetEffectiveAction)} />
            </div>
            {asset.selected_action !== 'auto' && asset.selected_action !== asset.auto_action && (
              <p className="text-sm text-warning">Manual override differs from the automatic recommendation.</p>
            )}
            {asset.status === 'offline' && (
              <p className="text-sm text-error">Offline asset should remain idle unless an operator explicitly overrides the schedule.</p>
            )}
          </div>
        </DetailBlock>

        <DetailBlock title="Schedule Context For This Asset">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <DecisionBadge decision={schedule.decision} />
              <ConfidenceBadge confidence={schedule.confidence} />
            </div>
            {scheduleHold ? (
              <div className="border border-warning/30 bg-warning/10 p-3">
                <p className="text-sm font-medium text-warning">No fleet action is currently recommended.</p>
                <p className="mt-1 text-sm text-text-secondary">
                  The global recommendation is hold, so this asset should remain idle unless an operator overrides the schedule.
                </p>
                {schedule.explanation[0] && <p className="mt-2 text-xs text-text-muted">{schedule.explanation[0]}</p>}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wider text-text-muted">Charge window</p>
                  <p className="text-text-primary">{formatWindow(schedule.charge_window.start, schedule.charge_window.end)} @ {schedule.charge_window.avg_price} €/MWh</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-text-muted">Discharge window</p>
                  <p className="text-text-primary">{formatWindow(schedule.discharge_window.start, schedule.discharge_window.end)} @ {schedule.discharge_window.avg_price} €/MWh</p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <MetricCard label="Spread after efficiency" value={`${schedule.spread_after_efficiency.toFixed(1)} €/MWh`} tone="info" />
              <MetricCard label="Expected fleet value" value={formatEuroRange(schedule.expected_value_range_eur)} tone="positive" />
            </div>
          </div>
        </DetailBlock>

        <DetailBlock title="Fleet Schedule Stress Context">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StressBadge level={asset.stress_level} />
              <StatusBadge label={`Schedule score ${schedule.battery_stress.score}`} tone={schedule.battery_stress.level === 'high' ? 'critical' : schedule.battery_stress.level === 'medium' ? 'warning' : 'positive'} />
            </div>
            {stressReasons.length > 0 ? (
              <ul className="space-y-1">
                {stressReasons.map((reason) => (
                  <li key={reason} className="text-sm text-text-secondary">- {reason}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-secondary">No schedule stress reasons returned.</p>
            )}
          </div>
        </DetailBlock>

        <DetailBlock title="Warnings">
          {warnings.length > 0 ? (
            <ul className="space-y-1">
              {warnings.map((warning) => (
                <li key={warning} className="text-sm text-text-secondary">- {warning}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-secondary">No asset-level warnings.</p>
          )}
        </DetailBlock>
      </div>
    </SectionPanel>
  )
}
