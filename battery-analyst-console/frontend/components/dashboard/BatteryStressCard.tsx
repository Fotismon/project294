'use client'

import React from 'react'
import { BatteryStress } from '@/types/api'
import { EmptyState, MetricCard, SectionPanel, StressBadge } from '@/components/ui'

interface BatteryStressCardProps {
  stress: BatteryStress
}

export function BatteryStressCard({ stress }: BatteryStressCardProps) {
  return (
    <SectionPanel
      title="Battery Stress"
      subtitle="Operational stress estimate for the recommended schedule."
      action={<StressBadge level={stress.level} score={stress.score} />}
    >
      <div className="space-y-4">
        <MetricCard
          label="Stress score"
          value={stress.score}
          helperText={`${stress.level} operating stress`}
          tone={stress.level === 'low' ? 'positive' : stress.level === 'medium' ? 'warning' : 'critical'}
        />
        {stress.reasons.length > 0 ? (
          <div className="space-y-2">
            {stress.reasons.map((reason) => (
              <div key={reason} className="flex items-start gap-2 text-sm">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-text-muted" />
                <span className="text-text-primary">{reason}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No stress reasons returned." />
        )}
      </div>
    </SectionPanel>
  )
}
