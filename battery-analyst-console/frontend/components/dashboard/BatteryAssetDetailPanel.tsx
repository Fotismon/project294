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
import { OptimizerBadge } from './OptimizerBadge'

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

function recommendedAction(asset: BatteryAsset, schedule: ScheduleResponse): EffectiveBatteryAction {
  if (schedule.decision === 'hold') return 'idle'
  if (asset.status === 'offline') return 'idle'
  return effectiveAction(asset)
}

function buildAssetRecommendationReasons(asset: BatteryAsset, schedule: ScheduleResponse): string[] {
  const reasons = [
    `Fleet-level decision is ${actionLabel(schedule.decision)} with ${actionLabel(schedule.confidence)} confidence.`
  ]

  if (schedule.decision === 'hold') {
    reasons.push('The fleet-level recommendation is hold, so this asset should remain idle unless an operator overrides the schedule.')
  } else {
    reasons.push(`Recommended charge window is ${formatWindow(schedule.charge_window.start, schedule.charge_window.end)} at ${schedule.charge_window.avg_price} €/MWh.`)
    reasons.push(`Recommended discharge window is ${formatWindow(schedule.discharge_window.start, schedule.discharge_window.end)} at ${schedule.discharge_window.avg_price} €/MWh.`)
    reasons.push(`Spread after efficiency is ${schedule.spread_after_efficiency.toFixed(1)} €/MWh.`)
  }

  reasons.push(`Asset SoC is ${formatPercent(asset.soc)}.`)
  reasons.push(`Asset stress level is ${asset.stress_level}.`)
  reasons.push(schedule.soc_feasibility.feasible ? 'Schedule SoC feasibility is satisfied.' : 'Schedule SoC feasibility has violations.')

  if (asset.temperature_c >= 30) reasons.push('Temperature is elevated.')
  if (asset.status === 'offline') reasons.push('Asset is offline.')
  if (asset.selected_action !== 'auto' && asset.selected_action !== asset.auto_action) {
    reasons.push('Manual override differs from automatic recommendation.')
  }

  return Array.from(new Set(reasons)).slice(0, 6)
}

function buildAssetWarnings(asset: BatteryAsset, schedule: ScheduleResponse): string[] {
  const warnings = [...asset.constraint_warnings]

  if (asset.selected_action !== 'auto' && asset.selected_action !== asset.auto_action) {
    warnings.push('Manual override differs from the automatic recommendation.')
  }

  if (asset.status === 'offline') {
    warnings.push('Offline asset should not be dispatched.')
  }

  if (asset.temperature_c >= 30) {
    warnings.push(`Temperature warning: asset is at ${asset.temperature_c}°C.`)
  }

  if (!schedule.physical_constraints.duration_ok) warnings.push('Duration constraint requires review.')
  if (!schedule.physical_constraints.cycle_limit_ok) warnings.push('Cycle limit requires review.')
  if (!schedule.physical_constraints.temperature_ok) warnings.push('Temperature constraint requires review.')
  if (!schedule.physical_constraints.rapid_switching_avoided) warnings.push('Rapid switching was not avoided.')

  schedule.soc_feasibility.violations.forEach((violation) => warnings.push(violation))

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
  const assetRecommendedAction = recommendedAction(asset, schedule)
  const recommendationReasons = buildAssetRecommendationReasons(asset, schedule)
  const warnings = buildAssetWarnings(asset, schedule)
  const scheduleHold = schedule.decision === 'hold'
  const stressReasons = schedule.battery_stress.reasons.slice(0, 5)
  const socViolations = schedule.soc_feasibility.violations.slice(0, 3)

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
            This asset-level recommendation context maps the fleet decision to the selected battery. Per-asset optimization is approximated until fleet scheduling is implemented.
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
            {scheduleHold && (
              <div className="border border-warning/30 bg-warning/10 p-3">
                <p className="text-sm font-medium text-warning">No action recommended for this asset</p>
                <p className="mt-1 text-sm text-text-secondary">
                  {schedule.explanation[0] || 'Forecasted spread does not compensate for round-trip efficiency losses and degradation risk.'}
                </p>
              </div>
            )}
            <p className="text-sm font-medium text-text-primary">Recommended asset action: {actionLabel(assetRecommendedAction)}</p>
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

        <DetailBlock title="Why This Action?">
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">Main reason: {recommendationReasons[0]}</p>
            <ul className="space-y-1">
              {recommendationReasons.slice(1).map((reason) => (
                <li key={reason} className="text-sm text-text-secondary">- {reason}</li>
              ))}
            </ul>
          </div>
        </DetailBlock>

        <DetailBlock title="Schedule context for this asset">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <DecisionBadge decision={schedule.decision} />
              <ConfidenceBadge confidence={schedule.confidence} />
              <OptimizerBadge optimizer={schedule.optimizer} compact />
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

        <DetailBlock title="SoC Feasibility Summary">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <StatusBadge label={schedule.soc_feasibility.feasible ? 'Feasible' : 'Not feasible'} tone={schedule.soc_feasibility.feasible ? 'positive' : 'critical'} dot />
              <StatusBadge label={`${schedule.soc_feasibility.violations.length} violation${schedule.soc_feasibility.violations.length === 1 ? '' : 's'}`} tone={schedule.soc_feasibility.violations.length > 0 ? 'warning' : 'positive'} />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wider text-text-muted">Start SoC</p>
                <p className="text-text-primary">{formatPercent(schedule.soc_feasibility.start_soc)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-text-muted">End SoC</p>
                <p className="text-text-primary">{formatPercent(schedule.soc_feasibility.end_soc)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-text-muted">Allowed range</p>
                <p className="text-text-primary">{formatPercent(schedule.soc_feasibility.min_soc)}-{formatPercent(schedule.soc_feasibility.max_soc)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-text-muted">Violations</p>
                <p className="text-text-primary">{schedule.soc_feasibility.violations.length}</p>
              </div>
            </div>
            {socViolations.length > 0 && (
              <ul className="space-y-1">
                {socViolations.map((violation) => (
                  <li key={violation} className="text-sm text-error">- {violation}</li>
                ))}
              </ul>
            )}
          </div>
        </DetailBlock>

        <DetailBlock title="Battery Stress Reasons">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StressBadge level={schedule.battery_stress.level} score={schedule.battery_stress.score} />
              <StatusBadge label={`Asset stress marker: ${asset.stress_level}`} tone={asset.stress_level === 'high' ? 'critical' : asset.stress_level === 'medium' ? 'warning' : 'positive'} />
            </div>
            <p className="text-xs text-text-muted">Schedule-level stress context. Asset stress is a fleet table marker until per-asset backend stress scoring is available.</p>
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

        <DetailBlock title="Constraint Warnings">
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

        <DetailBlock title="Fleet-level decision to asset impact">
          <p className="text-sm leading-relaxed text-text-secondary">
            The fleet recommendation is mapped to this battery using the current asset state, selected action, stress marker, and schedule constraints. Per-asset optimization is approximated in the frontend until fleet-level scheduling is implemented in the backend.
          </p>
        </DetailBlock>
      </div>
    </SectionPanel>
  )
}
