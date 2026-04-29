'use client'

import React from 'react'
import { ApiStatus } from '@/types/api'
import { ConsoleSectionId, SideNav } from './SideNav'
import { TopBar } from './TopBar'

interface DashboardShellProps {
  children: React.ReactNode
  activeSection?: ConsoleSectionId
  onSectionChange?: (section: ConsoleSectionId) => void
  apiStatus?: ApiStatus
  currentDateLabel?: string
  marketZone?: string
}

export function DashboardShell({
  children,
  activeSection = 'fleet',
  onSectionChange,
  apiStatus,
  currentDateLabel,
  marketZone
}: DashboardShellProps) {
  return (
    <div className="min-h-screen bg-background text-text-primary">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <SideNav activeSection={activeSection} onSectionChange={onSectionChange ?? (() => undefined)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            apiStatus={apiStatus}
            currentDateLabel={currentDateLabel}
            marketZone={marketZone}
          />
          <main className="flex-1 overflow-x-hidden px-4 py-5 lg:px-6 lg:py-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
