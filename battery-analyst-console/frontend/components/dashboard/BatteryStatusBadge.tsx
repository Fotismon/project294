'use client'

import React from 'react'
import { BatteryAsset } from '@/types/api'

interface BatteryStatusBadgeProps {
  status: BatteryAsset['status']
}

export function BatteryStatusBadge({ status }: BatteryStatusBadgeProps) {
  const classes = {
    available: 'border-success/30 bg-success/10 text-success',
    limited: 'border-warning/30 bg-warning/10 text-warning',
    offline: 'border-error/30 bg-error/10 text-error'
  }

  return (
    <span className={`rounded border px-2 py-0.5 text-xs font-medium ${classes[status]}`}>
      {status.toUpperCase()}
    </span>
  )
}
