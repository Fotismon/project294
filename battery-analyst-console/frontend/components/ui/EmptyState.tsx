import React from 'react'

interface EmptyStateProps {
  title: string
  message?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({
  title,
  message,
  action,
  className = ''
}: EmptyStateProps) {
  return (
    <div className={`border border-border bg-surface-elevated/50 px-4 py-8 text-center ${className}`}>
      <p className="text-sm font-semibold text-text-primary">{title}</p>
      {message && <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-text-secondary">{message}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
