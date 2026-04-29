'use client'

import React from 'react'
import { Alert as AlertType, Severity } from '@/types/api'
import { StatusBadge, BadgeTone } from '@/components/ui'

interface AlertCardProps {
  alert: AlertType
  relatedMetric?: string
}

const severityTone: Record<Severity, BadgeTone> = {
  critical: 'critical',
  warning: 'warning',
  info: 'info'
}

function humanizeSeverity(severity: Severity): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1)
}

export function inferRelatedMetric(alert: AlertType): string {
  const source = `${alert.title} ${alert.message}`.toLowerCase()

  if (source.includes('temperature')) return 'Temperature'
  if (source.includes('forecast') || source.includes('uncertainty')) return 'Forecast uncertainty'
  if (source.includes('data quality')) return 'Data quality'
  if (source.includes('spread')) return 'Economic spread'
  if (source.includes('soc')) return 'State of charge'
  if (source.includes('cycle')) return 'Cycle limit'
  if (source.includes('duration')) return 'Duration'
  if (source.includes('decision')) return 'Decision'
  if (source.includes('hold')) return 'No-go decision'
  if (source.includes('degradation')) return 'Degradation risk'

  return 'General'
}

export function AlertCard({ alert, relatedMetric }: AlertCardProps) {
  const metric = relatedMetric ?? inferRelatedMetric(alert)
  const recommendedAction = alert.recommended_action || 'Review this signal before dispatch.'

  return (
    <article className="border border-border bg-surface p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={humanizeSeverity(alert.severity)} tone={severityTone[alert.severity]} dot />
            <h4 className="text-sm font-semibold text-text-primary">{alert.title}</h4>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-text-secondary">{alert.message}</p>
        </div>
        <div className="shrink-0 border border-border bg-surface-elevated/40 px-3 py-2">
          <p className="text-xs uppercase tracking-wider text-text-muted">Related metric</p>
          <p className="mt-1 text-xs font-medium text-text-primary">{metric}</p>
        </div>
      </div>
      <div className="mt-4 border-t border-border pt-3">
        <p className="text-xs uppercase tracking-wider text-text-muted">Recommended action</p>
        <p className="mt-1 text-sm text-text-primary">{recommendedAction}</p>
      </div>
    </article>
  )
}
