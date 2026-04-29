'use client'

import React from 'react'
import { ApiStatus } from '@/types/api'

interface TopBarProps {
  title?: string
  subtitle?: string
  currentDateLabel?: string
  marketZone?: string
  apiStatus?: ApiStatus
}

const statusClasses: Record<ApiStatus['kind'], { dot: string; text: string }> = {
  connected: {
    dot: 'bg-success',
    text: 'text-success'
  },
  mock: {
    dot: 'bg-warning',
    text: 'text-warning'
  },
  error: {
    dot: 'bg-error',
    text: 'text-error'
  },
  loading: {
    dot: 'bg-info',
    text: 'text-text-secondary'
  }
}

export function TopBar({
  title = 'Battery Analyst Console',
  subtitle = 'Decision support for battery energy trading',
  currentDateLabel,
  marketZone = 'GR Day-Ahead',
  apiStatus
}: TopBarProps) {
  const statusStyle = apiStatus ? statusClasses[apiStatus.kind] : null

  return (
    <header className="border-b border-border bg-background/95 px-5 py-4 lg:px-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">{title}</h1>
          <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="border border-border bg-surface px-3 py-2 font-medium text-text-secondary">
            {marketZone}
          </span>
          {currentDateLabel && (
            <span className="border border-border bg-surface px-3 py-2 text-text-secondary">
              {currentDateLabel}
            </span>
          )}
          {apiStatus && statusStyle && (
            <span className="flex items-center gap-2 border border-border bg-surface px-3 py-2">
              <span className={`h-2 w-2 rounded-full ${statusStyle.dot}`} />
              <span className={`font-medium ${statusStyle.text}`}>{apiStatus.message}</span>
              {apiStatus.last_updated_at && (
                <span className="text-text-muted">Updated {apiStatus.last_updated_at}</span>
              )}
            </span>
          )}
        </div>
      </div>
    </header>
  )
}
