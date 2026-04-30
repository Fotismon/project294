'use client'

import React from 'react'
import { OptimizerMode } from '@/types/api'

interface OptimizerModeSelectorProps {
  value: OptimizerMode
  onChange: (value: OptimizerMode) => void
  disabled?: boolean
  compact?: boolean
}

const optimizerDescriptions: Record<OptimizerMode, string> = {
  window_v1: 'Transparent rolling-window scheduler.',
  milp: 'Optimization across all 96 intervals.',
  auto: 'Try MILP and fallback to Window V1.'
}

export function OptimizerModeSelector({
  value,
  onChange,
  disabled = false,
  compact = false
}: OptimizerModeSelectorProps) {
  return (
    <div className={compact ? 'min-w-[180px]' : 'min-w-[220px]'}>
      <label className="mb-2 block text-xs uppercase tracking-wider text-text-secondary">
        Optimizer mode
      </label>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as OptimizerMode)}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:text-text-muted"
      >
        <option value="window_v1">Window V1</option>
        <option value="milp">MILP</option>
        <option value="auto">Auto</option>
      </select>
      {!compact && (
        <p className="mt-1 text-xs leading-relaxed text-text-muted">
          {optimizerDescriptions[value]}
        </p>
      )}
    </div>
  )
}

