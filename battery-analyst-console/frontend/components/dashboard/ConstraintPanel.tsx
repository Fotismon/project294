'use client'

import React from 'react'
import { PhysicalConstraints } from '@/types/api'

interface ConstraintPanelProps {
  constraints: PhysicalConstraints
}

export function ConstraintPanel({ constraints }: ConstraintPanelProps) {
  const items = [
    { key: 'duration_ok', label: 'Duration OK', value: constraints.duration_ok },
    { key: 'cycle_limit_ok', label: 'Cycle Limit OK', value: constraints.cycle_limit_ok },
    { key: 'temperature_ok', label: 'Temperature OK', value: constraints.temperature_ok },
    { key: 'soc_feasible', label: 'SoC Feasible', value: constraints.soc_feasible },
    { key: 'round_trip_efficiency_applied', label: 'RTE Applied', value: constraints.round_trip_efficiency_applied },
    { key: 'rapid_switching_avoided', label: 'Rapid Switching Avoided', value: constraints.rapid_switching_avoided }
  ]

  return (
    <div className="rounded-lg border border-border bg-surface-elevated/50 p-4">
      <h3 className="mb-3 text-xs uppercase tracking-wider text-text-secondary">Physical Constraints</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.key}
            className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
              item.value ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
            }`}
          >
            <span className="text-text-primary">{item.label}</span>
            <span className="font-semibold">{item.value ? 'OK' : 'Fail'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
