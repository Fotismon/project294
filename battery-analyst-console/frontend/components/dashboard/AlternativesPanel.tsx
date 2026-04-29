'use client'

import React from 'react'
import { AlternativeSchedule } from '@/types/api'

interface AlternativesPanelProps {
  alternatives: AlternativeSchedule[]
}

export function AlternativesPanel({ alternatives }: AlternativesPanelProps) {
  return (
    <div className="rounded-lg border border-border bg-surface-elevated/50 p-4">
      <h3 className="mb-3 text-xs uppercase tracking-wider text-text-secondary">Top Alternatives</h3>
      {alternatives.length === 0 ? (
        <p className="text-sm text-text-muted">No alternatives available.</p>
      ) : (
        <div className="space-y-4">
          {alternatives.map((alt, index) => (
            <div key={index} className="rounded-lg border border-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-text-primary">Alternative {index + 1}</span>
                <span className="rounded bg-info/20 px-2 py-0.5 text-xs font-medium text-info">{alt.decision.replace(/_/g, ' ')}</span>
              </div>
              <div className="mb-2 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs text-text-muted">Charge Window</p>
                  <p className="text-text-primary">
                    {alt.charge_window.start}-{alt.charge_window.end}
                    <span className="text-text-muted"> @ {alt.charge_window.avg_price} €/MWh</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Discharge Window</p>
                  <p className="text-text-primary">
                    {alt.discharge_window.start}-{alt.discharge_window.end}
                    <span className="text-text-muted"> @ {alt.discharge_window.avg_price} €/MWh</span>
                  </p>
                </div>
              </div>
              <p className="mb-2 text-xs text-text-secondary">
                Spread after efficiency: <span className="font-medium text-text-primary">{alt.spread_after_efficiency} €/MWh</span>
              </p>
              {alt.rejection_reasons.length > 0 && (
                <div className="border-t border-border pt-2">
                  <p className="mb-1 text-xs text-text-muted">Rejection reasons</p>
                  <ul className="space-y-1">
                    {alt.rejection_reasons.map((reason) => (
                      <li key={reason} className="text-xs text-text-secondary">- {reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
