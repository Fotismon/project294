'use client'

import React from 'react'

export type ConsoleSectionId = 'fleet' | 'assets' | 'scenario' | 'backtest' | 'alerts'

interface SideNavItem {
  id: ConsoleSectionId
  label: string
  description?: string
}

interface SideNavProps {
  activeSection: ConsoleSectionId
  onSectionChange: (section: ConsoleSectionId) => void
}

const navItems: SideNavItem[] = [
  {
    id: 'fleet',
    label: 'Fleet Overview',
    description: 'Portfolio decision'
  },
  {
    id: 'assets',
    label: 'Battery Assets',
    description: 'Asset-level view'
  },
  {
    id: 'scenario',
    label: 'Scenario Analyst',
    description: 'What-if assumptions'
  },
  {
    id: 'backtest',
    label: 'Backtest',
    description: 'Historical replay'
  },
  {
    id: 'alerts',
    label: 'Alerts',
    description: 'Operational risk'
  }
]

export function SideNav({ activeSection, onSectionChange }: SideNavProps) {
  return (
    <aside className="border-b border-border bg-surface lg:sticky lg:top-0 lg:h-screen lg:w-[260px] lg:shrink-0 lg:border-b-0 lg:border-r">
      <div className="border-b border-border px-5 py-4">
        <p className="text-xs uppercase tracking-wider text-text-muted">Operations Console</p>
        <p className="mt-1 text-sm font-semibold text-text-primary">Battery Trading</p>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 py-3 lg:block lg:space-y-1 lg:overflow-x-visible">
        {navItems.map((item) => {
          const isActive = item.id === activeSection

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSectionChange(item.id)}
              className={`min-w-[190px] border-l-2 px-3 py-3 text-left transition lg:w-full ${
                isActive
                  ? 'border-info bg-surface-elevated text-text-primary'
                  : 'border-transparent text-text-secondary hover:border-border hover:bg-surface-elevated/50 hover:text-text-primary'
              }`}
            >
              <span className="block text-sm font-medium">{item.label}</span>
              {item.description && (
                <span className="mt-0.5 block text-xs text-text-muted">{item.description}</span>
              )}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
