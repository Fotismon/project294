'use client'

import React from 'react'

export type TabId = 'today' | 'scenario' | 'alerts' | 'backtest'

interface Tab {
  id: TabId
  label: string
}

const tabs: Tab[] = [
  { id: 'today', label: "Today's Plan" },
  { id: 'scenario', label: 'Scenario Analyst' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'backtest', label: 'Backtest' }
]

interface TabNavProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}

export function TabNav({ activeTab, onTabChange }: TabNavProps) {
  return (
    <nav className="flex gap-1 border-b border-border bg-surface rounded-t-lg p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`
            px-4 py-2 text-sm font-medium rounded-md transition-all duration-200
            ${activeTab === tab.id
              ? 'bg-surface-elevated text-text-primary'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated/50'
            }
          `}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}