'use client'

import React from 'react'
import { DispatchDiagnostics, OptimizerMetadata } from '@/types/api'
import { BadgeTone, EmptyState, MetricCard, SectionPanel } from '@/components/ui'

interface DispatchDiagnosticsPanelProps {
  diagnostics?: DispatchDiagnostics | null
  optimizer?: OptimizerMetadata | null
  className?: string
  compact?: boolean
}

function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
}

function formatMwh(value: number): string {
  return `${formatNumber(value)} MWh`
}

function formatMw(value: number): string {
  return `${formatNumber(value)} MW`
}

function formatPercentFromFraction(value: number): string {
  return `${formatNumber(value * 100, 2)}%`
}

function statusToneFromCount(count: number): BadgeTone {
  return count > 0 ? 'critical' : 'positive'
}

function gridTone(ok: boolean): BadgeTone {
  return ok ? 'positive' : 'critical'
}

export function DispatchDiagnosticsPanel({
  diagnostics,
  optimizer,
  className = '',
  compact = false
}: DispatchDiagnosticsPanelProps) {
  if (!diagnostics) {
    return (
      <SectionPanel
        title="Dispatch Diagnostics"
        subtitle="Physical feasibility metrics for the generated schedule."
        className={className}
      >
        <EmptyState
          title="Diagnostics unavailable"
          message="The backend response did not include dispatch diagnostics."
        />
      </SectionPanel>
    )
  }

  const socViolations = diagnostics.soc_min_violation_count + diagnostics.soc_max_violation_count
  const gridHelper = `max ${formatMw(diagnostics.max_grid_power_mw)} / limit ${formatMw(diagnostics.grid_connection_limit_mw)}`
  const columns = compact ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-4'

  return (
    <SectionPanel
      title="Dispatch Diagnostics"
      subtitle="Physical feasibility metrics for the generated schedule."
      className={className}
    >
      <div className={`grid grid-cols-1 gap-3 ${columns}`}>
        <MetricCard
          label="Equivalent full cycles"
          value={formatNumber(diagnostics.equivalent_full_cycles, 4)}
          helperText="Discharged MWh divided by nominal capacity."
          tone="info"
        />
        <MetricCard
          label="Auxiliary load"
          value={formatMw(diagnostics.auxiliary_load_mw)}
          helperText={formatMwh(diagnostics.auxiliary_energy_mwh)}
          tone={diagnostics.auxiliary_load_mw > 0 ? 'info' : 'neutral'}
        />
        <MetricCard
          label="Simultaneous action violations"
          value={diagnostics.simultaneous_action_violations}
          helperText="Intervals with charge and discharge active together."
          tone={statusToneFromCount(diagnostics.simultaneous_action_violations)}
        />
        <MetricCard
          label="Grid connection"
          value={diagnostics.grid_connection_limit_ok ? 'OK' : 'Exceeded'}
          helperText={gridHelper}
          tone={gridTone(diagnostics.grid_connection_limit_ok)}
        />
        <MetricCard
          label="Terminal SoC error"
          value={formatPercentFromFraction(diagnostics.terminal_soc_error)}
          helperText="Distance from target terminal SoC."
          tone={diagnostics.terminal_soc_error > 0.05 ? 'warning' : 'positive'}
        />
        <MetricCard
          label="SoC violations"
          value={socViolations}
          helperText={`${diagnostics.soc_min_violation_count} min / ${diagnostics.soc_max_violation_count} max`}
          tone={statusToneFromCount(socViolations)}
        />
        <MetricCard
          label="Ramp violations"
          value={diagnostics.ramp_rate_violations}
          helperText="Intervals exceeding ramp-rate limit."
          tone={statusToneFromCount(diagnostics.ramp_rate_violations)}
        />
        {optimizer?.used_mode === 'milp' && (
          <MetricCard
            label="Solver status"
            value={optimizer.solver_status ?? 'Unknown'}
            helperText={optimizer.is_optimal ? 'Optimal dispatch returned.' : 'Review solver metadata.'}
            tone={optimizer.is_optimal ? 'positive' : 'warning'}
          />
        )}
        {optimizer?.used_mode === 'milp' && optimizer.objective_value != null && (
          <MetricCard
            label="Objective value"
            value={`€${formatNumber(optimizer.objective_value)}`}
            helperText="MILP objective value returned by backend."
            tone={optimizer.objective_value >= 0 ? 'positive' : 'warning'}
          />
        )}
      </div>
    </SectionPanel>
  )
}
