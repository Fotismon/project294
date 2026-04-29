import React from 'react'
import { Decision } from '@/types/api'
import { BadgeTone, StatusBadge } from './StatusBadge'

interface DecisionBadgeProps {
  decision: Decision | string
  size?: 'sm' | 'md'
}

function formatUnknown(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function decisionDisplay(decision: Decision | string): { label: string; tone: BadgeTone } {
  switch (decision) {
    case 'execute':
      return { label: 'Execute', tone: 'positive' }
    case 'execute_with_caution':
      return { label: 'Execute with caution', tone: 'warning' }
    case 'watch':
      return { label: 'Watch', tone: 'info' }
    case 'hold':
      return { label: 'Hold', tone: 'critical' }
    default:
      return { label: formatUnknown(String(decision || 'Unknown')), tone: 'neutral' }
  }
}

export function DecisionBadge({ decision, size = 'sm' }: DecisionBadgeProps) {
  const display = decisionDisplay(decision)
  return <StatusBadge label={display.label} tone={display.tone} size={size} dot />
}
