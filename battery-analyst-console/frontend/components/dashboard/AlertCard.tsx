'use client'

import React from 'react'
import { Alert as AlertType } from '@/types/api'

interface AlertCardProps {
  alert: AlertType
}

export function AlertCard({ alert }: AlertCardProps) {
  const severityConfig = {
    critical: {
      bg: 'bg-error/10 border-error/30',
      text: 'text-error',
      icon: 'STOP',
      badge: 'bg-error/20'
    },
    warning: {
      bg: 'bg-warning/10 border-warning/30',
      text: 'text-warning',
      icon: 'WARN',
      badge: 'bg-warning/20'
    },
    info: {
      bg: 'bg-info/10 border-info/30',
      text: 'text-info',
      icon: 'INFO',
      badge: 'bg-info/20'
    }
  }

  const config = severityConfig[alert.severity]

  return (
    <div className={`rounded-lg border p-4 ${config.bg}`}>
      <div className="flex items-start gap-3">
        <span className={`rounded border px-2 py-1 text-[10px] font-semibold ${config.badge} ${config.text}`}>{config.icon}</span>
        <div className="flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${config.badge} ${config.text}`}>{alert.severity.toUpperCase()}</span>
            <h4 className="font-medium text-text-primary">{alert.title}</h4>
          </div>
          <p className="mb-3 text-sm text-text-secondary">{alert.message}</p>
          <div className="border-t border-border pt-2">
            <p className="text-xs text-text-muted">Recommended action</p>
            <p className="text-sm text-text-primary">{alert.recommended_action}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
