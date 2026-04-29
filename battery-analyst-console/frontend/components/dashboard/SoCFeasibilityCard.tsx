'use client'

import React from 'react'
import { SoCFeasibility } from '@/types/api'
import { MetricCard, SectionPanel, StatusBadge } from '@/components/ui'

interface SoCFeasibilityCardProps {
  feasibility: SoCFeasibility
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function SoCFeasibilityCard({ feasibility }: SoCFeasibilityCardProps) {
  return (
    <SectionPanel
      title="SoC Feasibility"
      subtitle="State-of-charge trajectory implied by the schedule."
      action={<StatusBadge label={feasibility.feasible ? 'OK' : 'Check'} tone={feasibility.feasible ? 'positive' : 'critical'} dot />}
    >
      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="Start SoC" value={pct(feasibility.start_soc)} />
        <MetricCard label="End SoC" value={pct(feasibility.end_soc)} />
        <MetricCard label="Allowed range" value={`${pct(feasibility.min_soc)}-${pct(feasibility.max_soc)}`} />
        <MetricCard
          label="Violations"
          value={feasibility.violations.length}
          tone={feasibility.violations.length > 0 ? 'critical' : 'positive'}
        />
      </div>
      <div className={`mt-3 border-t border-border pt-3 text-xs ${feasibility.violations.length > 0 ? 'text-error' : 'text-text-muted'}`}>
        {feasibility.violations.length > 0 ? feasibility.violations.join(', ') : 'No SoC violations returned.'}
      </div>
    </SectionPanel>
  )
}
