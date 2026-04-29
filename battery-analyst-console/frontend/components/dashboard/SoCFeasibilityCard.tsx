'use client'

import React from 'react'
import { SoCFeasibility } from '@/types/api'

interface SoCFeasibilityCardProps {
  feasibility: SoCFeasibility
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function SoCFeasibilityCard({ feasibility }: SoCFeasibilityCardProps) {
  return (
    <div className="rounded-lg border border-border bg-surface-elevated/50 p-4">
      <h3 className="mb-3 text-xs uppercase tracking-wider text-text-secondary">SoC Feasibility</h3>
      <div className={`mb-3 rounded-lg px-3 py-2 text-sm font-medium ${feasibility.feasible ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>
        {feasibility.feasible ? 'OK Feasible' : 'Fail Not feasible'}
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-text-muted">Start SoC</p>
          <p className="text-text-primary">{pct(feasibility.start_soc)}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">End SoC</p>
          <p className="text-text-primary">{pct(feasibility.end_soc)}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Min SoC Reached</p>
          <p className="text-text-primary">{pct(feasibility.min_soc_reached)}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Max SoC Reached</p>
          <p className="text-text-primary">{pct(feasibility.max_soc_reached)}</p>
        </div>
      </div>
      {feasibility.violations.length > 0 && (
        <div className="mt-3 border-t border-border pt-3 text-xs text-error">
          {feasibility.violations.join(', ')}
        </div>
      )}
    </div>
  )
}
