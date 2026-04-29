import React from 'react'

interface SectionPanelProps {
  title?: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function SectionPanel({
  title,
  subtitle,
  action,
  children,
  className = ''
}: SectionPanelProps) {
  const hasHeader = title || subtitle || action

  return (
    <section className={`border border-border bg-surface-elevated/50 ${className}`}>
      {hasHeader && (
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-start md:justify-between">
          <div>
            {title && <h3 className="text-sm font-semibold text-text-primary">{title}</h3>}
            {subtitle && <p className="mt-1 text-xs leading-relaxed text-text-secondary">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}
