'use client'

import React from 'react'
import { Alert, BatteryAsset, Severity } from '@/types/api'
import { AlertCard, inferRelatedMetric } from './AlertCard'
import { EmptyState, MetricCard, SectionPanel, StatusBadge } from '@/components/ui'

interface FleetAlertsPanelProps {
  alerts: Alert[]
  assets: BatteryAsset[]
}

type AlertGroups = Record<Severity, Alert[]>

const severityOrder: Severity[] = ['critical', 'warning', 'info']

const groupMetadata: Record<Severity, { title: string; subtitle: string }> = {
  critical: {
    title: 'Critical risks',
    subtitle: 'Immediate review required.'
  },
  warning: {
    title: 'Warnings',
    subtitle: 'Review before dispatch.'
  },
  info: {
    title: 'Information',
    subtitle: 'Context from the latest schedule or scenario.'
  }
}

function groupAlertsBySeverity(alerts: Alert[]): AlertGroups {
  return {
    critical: alerts.filter((alert) => alert.severity === 'critical'),
    warning: alerts.filter((alert) => alert.severity === 'warning'),
    info: alerts.filter((alert) => alert.severity === 'info')
  }
}

function generateAssetWarnings(assets: BatteryAsset[]): Alert[] {
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
        message: `${asset.name} is at ${asset.temperature_c} C.`,
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

  return generatedAlerts
}

export function FleetAlertsPanel({ alerts, assets }: FleetAlertsPanelProps) {
  const grouped = groupAlertsBySeverity(alerts)
  const assetWarnings = generateAssetWarnings(assets)
  const offlineAssets = assets.filter((asset) => asset.status === 'offline').length
  const limitedAssets = assets.filter((asset) => asset.status === 'limited').length

  if (alerts.length === 0) {
    return (
      <div className="space-y-6">
        <SectionPanel
          title="Operational Risk Center"
          subtitle="Alerts reflect the latest schedule or scenario result."
        >
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="Critical" value={0} />
            <MetricCard label="Warning" value={0} />
            <MetricCard label="Info" value={0} />
            <MetricCard label="Total alerts" value={0} helperText="Latest schedule/scenario" />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <AssetContext label="Assets monitored" value={assets.length} />
            <AssetContext label="Offline assets" value={offlineAssets} tone={offlineAssets > 0 ? 'critical' : 'positive'} />
            <AssetContext label="Limited assets" value={limitedAssets} tone={limitedAssets > 0 ? 'warning' : 'positive'} />
          </div>
          <EmptyState
            title="No active alerts"
            message="No active alerts from the latest schedule or scenario."
            className="mt-4"
          />
          <p className="mt-3 text-center text-xs text-text-muted">
            Run a scenario or refresh the schedule to update operational risk signals.
          </p>
        </SectionPanel>

        {assetWarnings.length > 0 && (
          <SectionPanel
            title="Asset warnings"
            subtitle="Asset-level context from current fleet status and operator selections."
            action={<StatusBadge label={`${assetWarnings.length}`} tone="warning" />}
          >
            <div className="space-y-3">
              {assetWarnings.map((alert, index) => (
                <AlertCard
                  key={`asset-${alert.severity}-${alert.title}-${index}`}
                  alert={alert}
                  relatedMetric={inferRelatedMetric(alert)}
                />
              ))}
            </div>
          </SectionPanel>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SectionPanel
        title="Operational Risk Center"
        subtitle="Alerts reflect the latest schedule or scenario result."
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label="Critical" value={grouped.critical.length} tone={grouped.critical.length > 0 ? 'critical' : 'neutral'} />
          <MetricCard label="Warning" value={grouped.warning.length} tone={grouped.warning.length > 0 ? 'warning' : 'neutral'} />
          <MetricCard label="Info" value={grouped.info.length} tone={grouped.info.length > 0 ? 'info' : 'neutral'} />
          <MetricCard label="Total alerts" value={alerts.length} helperText="Latest schedule/scenario" />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <AssetContext label="Assets monitored" value={assets.length} />
          <AssetContext label="Offline assets" value={offlineAssets} tone={offlineAssets > 0 ? 'critical' : 'positive'} />
          <AssetContext label="Limited assets" value={limitedAssets} tone={limitedAssets > 0 ? 'warning' : 'positive'} />
        </div>
      </SectionPanel>

      {severityOrder.map((severity) => {
          const severityAlerts = grouped[severity]
          if (severityAlerts.length === 0) return null

          return (
            <SectionPanel
              key={severity}
              title={groupMetadata[severity].title}
              subtitle={groupMetadata[severity].subtitle}
              action={<StatusBadge label={`${severityAlerts.length}`} tone={severity === 'critical' ? 'critical' : severity === 'warning' ? 'warning' : 'info'} />}
            >
              <div className="space-y-3">
                {severityAlerts.map((alert, index) => (
                  <AlertCard
                    key={`${alert.severity}-${alert.title}-${index}`}
                    alert={alert}
                    relatedMetric={inferRelatedMetric(alert)}
                  />
                ))}
              </div>
            </SectionPanel>
          )
        })}

      {assetWarnings.length > 0 && (
        <SectionPanel
          title="Asset warnings"
          subtitle="Asset-level context from current fleet status and operator selections."
          action={<StatusBadge label={`${assetWarnings.length}`} tone="warning" />}
        >
          <div className="space-y-3">
            {assetWarnings.map((alert, index) => (
              <AlertCard
                key={`asset-${alert.severity}-${alert.title}-${index}`}
                alert={alert}
                relatedMetric={inferRelatedMetric(alert)}
              />
            ))}
          </div>
        </SectionPanel>
      )}
    </div>
  )
}

function AssetContext({
  label,
  value,
  tone = 'neutral'
}: {
  label: string
  value: number
  tone?: 'neutral' | 'positive' | 'warning' | 'critical' | 'info'
}) {
  return (
    <div className="flex items-center justify-between border border-border bg-surface px-3 py-2">
      <span className="text-xs uppercase tracking-wider text-text-secondary">{label}</span>
      <StatusBadge label={String(value)} tone={tone} />
    </div>
  )
}
