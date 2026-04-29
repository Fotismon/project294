'use client'

import React from 'react'
import { BatteryStress } from '@/types/api'

interface BatteryStressCardProps {
  stress: BatteryStress
}

export function BatteryStressCard({ stress }: BatteryStressCardProps) {
  const levelColors = {
    low: 'text-success bg-success/10 border-success/30',
    medium: 'text-warning bg-warning/10 border-warning/30',
    high: 'text-error bg-error/10 border-error/30'
  }

  return (
    <div className="rounded-lg border border-border bg-surface-elevated/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wider text-text-secondary">Battery Stress</h3>
        <span className={`rounded border px-2 py-1 text-xs font-medium ${levelColors[stress.level]}`}>{stress.level.toUpperCase()}</span>
      </div>
      <div className="mb-4 flex items-center gap-4">
        <div className="relative h-16 w-16">
          <svg className="h-16 w-16 -rotate-90">
            <circle cx="32" cy="32" r="28" stroke="#2a2a3a" strokeWidth="4" fill="none" />
            <circle
              cx="32"
              cy="32"
              r="28"
              stroke={stress.level === 'low' ? '#22c55e' : stress.level === 'medium' ? '#f59e0b' : '#ef4444'}
              strokeWidth="4"
              fill="none"
              strokeDasharray={`${(stress.score / 100) * 176} 176`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-semibold text-text-primary">{stress.score}</span>
          </div>
        </div>
        <div className="text-sm text-text-secondary">Stress Score</div>
      </div>
      <div className="space-y-2">
        {stress.reasons.map((reason) => (
          <div key={reason} className="flex items-start gap-2 text-sm">
            <span className="text-text-muted">-</span>
            <span className="text-text-primary">{reason}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
