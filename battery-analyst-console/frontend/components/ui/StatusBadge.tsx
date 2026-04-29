import React from 'react'

export type BadgeTone = 'neutral' | 'positive' | 'warning' | 'critical' | 'info'
export type BadgeSize = 'sm' | 'md'

interface StatusBadgeProps {
  label: string
  tone?: BadgeTone
  size?: BadgeSize
  dot?: boolean
  className?: string
}

const toneClasses: Record<BadgeTone, { shell: string; dot: string }> = {
  neutral: {
    shell: 'border-border bg-surface text-text-secondary',
    dot: 'bg-text-muted'
  },
  positive: {
    shell: 'border-success/30 bg-success/10 text-success',
    dot: 'bg-success'
  },
  warning: {
    shell: 'border-warning/30 bg-warning/10 text-warning',
    dot: 'bg-warning'
  },
  critical: {
    shell: 'border-error/30 bg-error/10 text-error',
    dot: 'bg-error'
  },
  info: {
    shell: 'border-info/30 bg-info/10 text-info',
    dot: 'bg-info'
  }
}

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm'
}

export function StatusBadge({
  label,
  tone = 'neutral',
  size = 'sm',
  dot = false,
  className = ''
}: StatusBadgeProps) {
  const classes = toneClasses[tone]

  return (
    <span className={`inline-flex items-center gap-1.5 border font-medium ${classes.shell} ${sizeClasses[size]} ${className}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${classes.dot}`} />}
      {label}
    </span>
  )
}
