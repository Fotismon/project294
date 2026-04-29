import React from 'react'
import { BatteryStressLevel } from '@/types/api'
import { BadgeTone, StatusBadge } from './StatusBadge'

interface StressBadgeProps {
  level: BatteryStressLevel | string
  score?: number
  size?: 'sm' | 'md'
}

function formatUnknown(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function stressDisplay(level: BatteryStressLevel | string): { label: string; tone: BadgeTone } {
  switch (level) {
    case 'low':
      return { label: 'Low', tone: 'positive' }
    case 'medium':
      return { label: 'Medium', tone: 'warning' }
    case 'high':
      return { label: 'High', tone: 'critical' }
    default:
      return { label: formatUnknown(String(level || 'Unknown')), tone: 'neutral' }
  }
}

export function StressBadge({ level, score, size = 'sm' }: StressBadgeProps) {
  const display = stressDisplay(level)
  const label = typeof score === 'number' ? `${display.label} · ${score}` : display.label

  return <StatusBadge label={label} tone={display.tone} size={size} dot />
}
