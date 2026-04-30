'use client'

import React from 'react'
import { ForecastProvenance, PriceSpreadDiagnostics } from '@/types/api'
import { EmptyState, MetricCard, SectionPanel, StatusBadge } from '@/components/ui'

interface ValueDiagnosticsPanelProps {
  provenance?: ForecastProvenance | null
  diagnostics?: PriceSpreadDiagnostics | null
}

function eurPerMwh(value: number): string {
  return `${value.toFixed(2)} EUR/MWh`
}

export function ValueDiagnosticsPanel({ provenance, diagnostics }: ValueDiagnosticsPanelProps) {
  return (
    <SectionPanel
      title="Price & Value Diagnostics"
      subtitle="Spread comparison, units, and forecast provenance."
    >
      {!diagnostics ? (
        <EmptyState
          title="Price diagnostics unavailable"
          message="The schedule response did not include spread diagnostics."
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <StatusBadge label={provenance?.price_unit ?? 'EUR/MWh'} tone="info" dot />
            <StatusBadge label={provenance?.weather_source ?? 'Open-Meteo'} tone="neutral" />
            <StatusBadge label="Weather-derived price forecast" tone="warning" />
          </div>
          <p className="text-xs leading-relaxed text-text-secondary">
            {provenance?.weather_api_role ?? 'Weather API data is used as model input, not direct market price data.'}
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <MetricCard
              label="Old mock raw spread"
              value={eurPerMwh(diagnostics.mock_reference.raw_spread_eur_per_mwh)}
              helperText={`${eurPerMwh(diagnostics.mock_reference.charge_avg_price_eur_per_mwh)} charge / ${eurPerMwh(diagnostics.mock_reference.discharge_avg_price_eur_per_mwh)} discharge`}
            />
            <MetricCard
              label="Live forecast raw spread"
              value={eurPerMwh(diagnostics.live_forecast.raw_spread_eur_per_mwh)}
              helperText={`${eurPerMwh(diagnostics.live_forecast.charge_avg_price_eur_per_mwh)} charge / ${eurPerMwh(diagnostics.live_forecast.discharge_avg_price_eur_per_mwh)} discharge`}
              tone="info"
            />
            <MetricCard
              label="Old mock spread after efficiency"
              value={eurPerMwh(diagnostics.mock_reference.spread_after_efficiency_eur_per_mwh)}
            />
            <MetricCard
              label="Live spread after efficiency"
              value={eurPerMwh(diagnostics.live_forecast.spread_after_efficiency_eur_per_mwh)}
              tone="info"
            />
          </div>
          <p className="text-xs text-text-muted">{diagnostics.value_math}</p>
        </div>
      )}
    </SectionPanel>
  )
}
