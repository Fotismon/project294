'use client'

import React from 'react'
import { PhysicalConstraints } from '@/types/api'
import { SectionPanel, StatusBadge } from '@/components/ui'

interface ConstraintPanelProps {
  constraints: PhysicalConstraints
}

export function ConstraintPanel({ constraints }: ConstraintPanelProps) {
  const items = [
    { key: 'duration_ok', label: 'Duration', value: constraints.duration_ok },
    { key: 'cycle_limit_ok', label: 'Cycle limit', value: constraints.cycle_limit_ok },
    { key: 'temperature_ok', label: 'Temperature', value: constraints.temperature_ok },
    { key: 'soc_feasible', label: 'SoC feasibility', value: constraints.soc_feasible },
    { key: 'round_trip_efficiency_applied', label: 'RTE applied', value: constraints.round_trip_efficiency_applied },
    { key: 'rapid_switching_avoided', label: 'Rapid switching', value: constraints.rapid_switching_avoided }
  ]

  return (
    <SectionPanel title="Physical Constraints" subtitle="Pass/fail checks applied to the schedule.">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((item) => {
          const value = Boolean(item.value)

          return (
            <div key={item.key} className="flex items-center justify-between gap-3 border border-border bg-surface px-3 py-2 text-sm">
              <span className="text-text-primary">{item.label}</span>
              <StatusBadge label={value ? 'OK' : 'Check'} tone={value ? 'positive' : 'critical'} dot />
            </div>
          )
        })}
      </div>
    </SectionPanel>
  )
}
