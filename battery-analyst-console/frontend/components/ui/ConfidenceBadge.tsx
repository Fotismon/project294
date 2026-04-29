import React from 'react'
import { Confidence } from '@/types/api'
import { BadgeTone, StatusBadge } from './StatusBadge'

interface ConfidenceBadgeProps {
  confidence: Confidence | string
  size?: 'sm' | 'md'
}

function formatUnknown(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function confidenceDisplay(confidence: Confidence | string): { label: string; tone: BadgeTone } {
  switch (confidence) {
    case 'high':
      return { label: 'High', tone: 'positive' }
    case 'medium_high':
      return { label: 'Medium-high', tone: 'info' }
    case 'medium':
      return { label: 'Medium', tone: 'warning' }
    case 'low':
      return { label: 'Low', tone: 'critical' }
    default:
      return { label: formatUnknown(String(confidence || 'Unknown')), tone: 'neutral' }
  }
}

export function ConfidenceBadge({ confidence, size = 'sm' }: ConfidenceBadgeProps) {
  const display = confidenceDisplay(confidence)
  return <StatusBadge label={display.label} tone={display.tone} size={size} dot />
}
