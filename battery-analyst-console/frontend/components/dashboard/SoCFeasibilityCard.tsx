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
          <p className="text-xs text-text-muted">Allowed Range</p>
          <p className="text-text-primary">{pct(feasibility.min_soc)}-{pct(feasibility.max_soc)}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Violations</p>
          <p className="text-text-primary">{feasibility.violations.length}</p>
        </div>
      </div>
      <div className={`mt-3 border-t border-border pt-3 text-xs ${feasibility.violations.length > 0 ? 'text-error' : 'text-text-muted'}`}>
        {feasibility.violations.length > 0 ? feasibility.violations.join(', ') : 'No SoC violations returned.'}
      </div>
    </div>
  )
}
