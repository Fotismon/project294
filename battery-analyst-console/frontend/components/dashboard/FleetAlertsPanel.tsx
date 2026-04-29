'use client'

import React from 'react'
import { Alert, BatteryAsset } from '@/types/api'
import { AlertCard } from './AlertCard'

interface FleetAlertsPanelProps {
  alerts: Alert[]
  assets: BatteryAsset[]
}

export function FleetAlertsPanel({ alerts, assets }: FleetAlertsPanelProps) {
  const generatedAlerts: Alert[] = assets.flatMap((asset) => {
    const assetAlerts: Alert[] = []
    const effectiveAction = asset.selected_action === 'auto' ? asset.auto_action : asset.selected_action

    if (asset.status === 'offline') {
      assetAlerts.push({
        severity: 'critical',
        title: `Battery offline: ${asset.name}`,
        message: `${asset.name} is offline and should remain idle.`,
        recommended_action: 'Exclude this asset from fleet dispatch until it returns to service.'
      })
    }

    if (asset.temperature_c >= 33) {
      assetAlerts.push({
        severity: 'warning',
        title: `High temperature: ${asset.name}`,
        message: `${asset.name} is at ${asset.temperature_c} °C.`,
        recommended_action: 'Use conservative action or idle mode if temperature rises further.'
      })
    }

    if (asset.selected_action !== 'auto' && asset.selected_action !== asset.auto_action) {
      assetAlerts.push({
        severity: 'warning',
        title: `Manual override conflict: ${asset.name}`,
        message: `Manual ${asset.selected_action} conflicts with forecast-driven ${asset.auto_action}.`,
        recommended_action: 'Confirm operator rationale before dispatch.'
      })
    }

    if (effectiveAction === 'discharge' && asset.soc < 0.25) {
      assetAlerts.push({
        severity: 'warning',
        title: `Low SoC asset cannot discharge: ${asset.name}`,
        message: `${asset.name} is at ${Math.round(asset.soc * 100)}% SoC.`,
        recommended_action: 'Return to auto or charge until SoC recovers.'
      })
    }

    if (asset.stress_level === 'high' && effectiveAction !== 'idle') {
      assetAlerts.push({
        severity: 'warning',
        title: `High stress asset should remain idle: ${asset.name}`,
        message: `${asset.name} is high stress but currently set to ${effectiveAction}.`,
        recommended_action: 'Use idle or auto mode unless the spread is exceptional.'
      })
    }

    return assetAlerts
  })

  const discharging = assets.filter((asset) => (asset.selected_action === 'auto' ? asset.auto_action : asset.selected_action) === 'discharge')
  if (discharging.length > Math.ceil(assets.length / 2)) {
    generatedAlerts.push({
      severity: 'warning',
      title: 'Too many batteries discharging',
      message: `${discharging.length} assets are discharging at once.`,
      recommended_action: 'Stagger discharge actions to reduce fleet stress.'
    })
  }

  const allAlerts = [...generatedAlerts, ...alerts]
  const grouped = {
    critical: allAlerts.filter((alert) => alert.severity === 'critical'),
    warning: allAlerts.filter((alert) => alert.severity === 'warning'),
    info: allAlerts.filter((alert) => alert.severity === 'info')
  }

  if (allAlerts.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface-elevated/50 p-6 text-sm text-text-muted">
        No active alerts from the latest schedule.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {(['critical', 'warning', 'info'] as const).map((severity) => (
        <div key={severity} className="space-y-3">
          <h3 className={`text-xs uppercase tracking-wider ${severity === 'critical' ? 'text-error' : severity === 'warning' ? 'text-warning' : 'text-info'}`}>
            {severity}
          </h3>
          {grouped[severity].map((alert, index) => (
            <AlertCard key={`${alert.severity}-${alert.title}-${index}`} alert={alert} />
          ))}
        </div>
      ))}
    </div>
  )
}
