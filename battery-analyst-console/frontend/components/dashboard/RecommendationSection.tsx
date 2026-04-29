'use client'

import React from 'react'
import { FleetRecommendation, ScheduleResponse } from '@/types/api'
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
    <div className="rounded-lg border border-border bg-surface-elevated/50 p-4">
      <h3 className="mb-3 text-xs uppercase tracking-wider text-text-secondary">Schedule Alerts</h3>
      {alerts.length === 0 ? (
        <p className="text-sm text-text-muted">No active schedule alerts.</p>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert, index) => (
            <AlertCard key={`${alert.severity}-${alert.title}-${index}`} alert={alert} />
          ))}
        </div>
      )}
    </div>
  )
}
