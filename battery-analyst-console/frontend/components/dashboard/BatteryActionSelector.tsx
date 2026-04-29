'use client'

import React from 'react'
import { BatteryAction } from '@/types/api'

interface BatteryActionSelectorProps {
  value: BatteryAction
  onChange: (action: BatteryAction) => void
  disabled?: boolean
}

const actions: BatteryAction[] = ['auto', 'charge', 'discharge', 'idle']

export function BatteryActionSelector({ value, onChange, disabled = false }: BatteryActionSelectorProps) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as BatteryAction)}
      className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
    >
      {actions.map((action) => (
        <option key={action} value={action}>
          {action.charAt(0).toUpperCase() + action.slice(1)}
        </option>
      ))}
    </select>
  )
}
