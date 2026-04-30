'use client'

import React from 'react'
import { ApiStatus } from '@/types/api'

interface ApiStatusBannerProps {
  status: ApiStatus
}

const kindClasses: Record<ApiStatus['kind'], { shell: string; dot: string; label: string }> = {
  connected: {
    shell: 'border-success/40 bg-success/5',
    dot: 'bg-success',
    label: 'text-success'
  },
  error: {
    shell: 'border-error/40 bg-error/5',
    dot: 'bg-error',
    label: 'text-error'
  },
  loading: {
    shell: 'border-border bg-surface-elevated/50',
    dot: 'bg-info',
    label: 'text-text-primary'
  }
}

export function ApiStatusBanner({ status }: ApiStatusBannerProps) {
  const classes = kindClasses[status.kind]

  return (
    <div className={`mb-4 rounded-lg border px-4 py-3 ${classes.shell}`}>
      <div className="flex flex-col gap-2 text-sm md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${classes.dot}`} />
          <div>
            <p className={`font-medium ${classes.label}`}>{status.message}</p>
            {status.detail && (
              <p className="mt-0.5 text-xs text-text-secondary">{status.detail}</p>
            )}
          </div>
        </div>
        {status.last_updated_at && (
          <p className="shrink-0 text-xs text-text-muted">Updated {status.last_updated_at}</p>
        )}
      </div>
    </div>
  )
}
