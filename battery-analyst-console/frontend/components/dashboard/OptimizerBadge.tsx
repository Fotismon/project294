'use client'

import React from 'react'
import { OptimizerMetadata } from '@/types/api'
import { BadgeTone, StatusBadge } from '@/components/ui'

interface OptimizerBadgeProps {
  optimizer?: OptimizerMetadata | null
  compact?: boolean
  className?: string
}

function modeLabel(mode: string | undefined): string {
  if (mode === 'milp') return 'MILP'
  if (mode === 'window_v1') return 'Window V1'
  if (mode === 'auto') return 'Auto'
  return mode ? mode.replace(/_/g, ' ') : 'Unknown'
}

function versionLabel(version: string): string {
  if (version === 'window_v1.2') return 'v1.2'
  if (version === 'milp_v1') return 'MILP v1'
  return version
}

function optimizerTone(optimizer?: OptimizerMetadata | null): BadgeTone {
  if (!optimizer) return 'neutral'
  if (optimizer.fallback_used) return 'warning'
  if (optimizer.used_mode === 'milp' && optimizer.is_optimal) return 'positive'
  if (optimizer.used_mode === 'milp') return optimizer.solver_status && optimizer.solver_status !== 'optimal' ? 'warning' : 'info'
  if (optimizer.solver_status === 'infeasible' || optimizer.solver_status === 'not_implemented') return 'warning'
  return 'info'
}

function primaryLabel(optimizer?: OptimizerMetadata | null): string {
  if (!optimizer) return 'Optimizer: Unknown'
  if (optimizer.fallback_used) return `Fallback: ${modeLabel(optimizer.used_mode)}`
  return `Optimizer: ${modeLabel(optimizer.used_mode)}`
}

export function OptimizerBadge({
  optimizer,
  compact = false,
  className = ''
}: OptimizerBadgeProps) {
  const requestedDiffers = optimizer && optimizer.requested_mode !== optimizer.used_mode
  const solverStatus = optimizer?.used_mode === 'milp' && optimizer.solver_status
    ? `Solver: ${optimizer.solver_status}`
    : null

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <StatusBadge label={primaryLabel(optimizer)} tone={optimizerTone(optimizer)} dot size={compact ? 'sm' : 'md'} />
      {optimizer?.fallback_used && <StatusBadge label="Fallback used" tone="warning" size={compact ? 'sm' : 'md'} />}
      {solverStatus && <StatusBadge label={solverStatus} tone={optimizer?.is_optimal ? 'positive' : 'neutral'} size={compact ? 'sm' : 'md'} />}
      {!compact && optimizer?.model_version && <StatusBadge label={versionLabel(optimizer.model_version)} tone="neutral" />}
      {!compact && requestedDiffers && <StatusBadge label={`Requested: ${modeLabel(optimizer.requested_mode)}`} tone="neutral" />}
      {!compact && optimizer?.fallback_reason && (
        <p className="basis-full text-xs leading-relaxed text-text-muted">{optimizer.fallback_reason}</p>
      )}
    </div>
  )
}
