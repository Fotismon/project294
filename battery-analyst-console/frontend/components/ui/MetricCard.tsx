import React from 'react'
import { BadgeTone } from './StatusBadge'

interface MetricCardProps {
  label: string
  value: React.ReactNode
  helperText?: string
  trend?: string
  tone?: BadgeTone
  className?: string
}

const toneClasses: Record<BadgeTone, { shell: string; value: string; accent: string }> = {
  neutral: {
    shell: 'border-border',
    value: 'text-text-primary',
    accent: 'text-text-muted'
  },
  positive: {
    shell: 'border-success/40',
    value: 'text-success',
    accent: 'text-success'
  },
  warning: {
    shell: 'border-warning/40',
    value: 'text-warning',
    accent: 'text-warning'
  },
  critical: {
    shell: 'border-error/40',
    value: 'text-error',
    accent: 'text-error'
  },
  info: {
    shell: 'border-info/40',
    value: 'text-info',
    accent: 'text-info'
  }
}

export function MetricCard({
  label,
  value,
  helperText,
  trend,
  tone = 'neutral',
  className = ''
}: MetricCardProps) {
  const classes = toneClasses[tone]

  return (
    <div className={`border bg-surface-elevated/50 p-4 ${classes.shell} ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs uppercase tracking-wider text-text-secondary">{label}</p>
        {trend && <p className={`shrink-0 text-xs font-medium ${classes.accent}`}>{trend}</p>}
      </div>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${classes.value}`}>{value}</p>
      {helperText && <p className="mt-2 text-xs leading-relaxed text-text-muted">{helperText}</p>}
    </div>
  )
}
