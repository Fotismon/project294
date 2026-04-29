'use client'

import React from 'react'
import { FleetRecommendation, ScheduleResponse } from '@/types/api'
import { EmptyState, SectionPanel } from '@/components/ui'
import { AlertCard } from './AlertCard'
import { AlternativesPanel } from './AlternativesPanel'
import { BatteryStressCard } from './BatteryStressCard'
import { ConstraintPanel } from './ConstraintPanel'
import { ExplanationPanel } from './ExplanationPanel'
import { FleetRecommendationSummary } from './FleetRecommendationSummary'
import { RecommendationCards } from './RecommendationCards'
import { SoCFeasibilityCard } from './SoCFeasibilityCard'

interface RecommendationSectionProps {
  schedule: ScheduleResponse
  fleetRecommendation: FleetRecommendation
}

export function RecommendationSection({ schedule, fleetRecommendation }: RecommendationSectionProps) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Recommendation</h2>
        <p className="mt-1 text-sm text-text-secondary">Fleet-level recommendation plus asset-level dispatch context.</p>
      </div>
      <FleetRecommendationSummary recommendation={fleetRecommendation} />
      <RecommendationCards schedule={schedule} />
      <ScheduleAlerts alerts={schedule.alerts} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <ConstraintPanel constraints={schedule.physical_constraints} />
          <BatteryStressCard stress={schedule.battery_stress} />
        </div>
        <div className="space-y-6">
          <SoCFeasibilityCard feasibility={schedule.soc_feasibility} />
          <AlternativesPanel alternatives={schedule.alternatives} />
        </div>
      </div>
      <ExplanationPanel explanations={schedule.explanation} />
    </section>
  )
}

function ScheduleAlerts({ alerts }: { alerts: ScheduleResponse['alerts'] }) {
  return (
    <SectionPanel title="Schedule Alerts" subtitle="Operational risk flags returned with the latest recommendation.">
      {alerts.length === 0 ? (
        <EmptyState title="No active schedule alerts." />
      ) : (
        <div className="space-y-3">
          {alerts.map((alert, index) => (
            <AlertCard key={`${alert.severity}-${alert.title}-${index}`} alert={alert} />
          ))}
        </div>
      )}
    </SectionPanel>
  )
}
