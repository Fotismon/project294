'use client'

import React from 'react'
import { FleetRecommendation } from '@/types/api'

interface FleetRecommendationSummaryProps {
  recommendation: FleetRecommendation
}

export function FleetRecommendationSummary({ recommendation }: FleetRecommendationSummaryProps) {
  return (
    <div className="rounded-lg border border-border bg-surface-elevated/50 p-4">
      <h3 className="mb-3 text-xs uppercase tracking-wider text-text-secondary">Fleet Recommendation Summary</h3>
      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
        <SummaryItem label="Charge" value={recommendation.summary.assets_charging} />
        <SummaryItem label="Discharge" value={recommendation.summary.assets_discharging} />
        <SummaryItem label="Idle" value={recommendation.summary.assets_idle} />
        <SummaryItem label="Overrides" value={recommendation.manual_override_count} />
        <SummaryItem label="Value Delta" value={`€${recommendation.override_value_delta_eur[0]}-€${recommendation.override_value_delta_eur[1]}`} />
      </div>
      {recommendation.warnings.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-xs uppercase tracking-wider text-warning">Override / constraint warnings</p>
          <ul className="space-y-1 text-sm text-text-secondary">
            {recommendation.warnings.map((warning) => (
              <li key={warning}>- {warning}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function SummaryItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-text-primary">{value}</p>
    </div>
  )
}
