'use client'

import React from 'react'
import { FleetRecommendation, ScheduleResponse } from '@/types/api'
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
  const explanations = [
    ...schedule.explanation,
    `Fleet action mix: ${fleetRecommendation.summary.assets_charging} charging, ${fleetRecommendation.summary.assets_discharging} discharging, ${fleetRecommendation.summary.assets_idle} idle.`,
    fleetRecommendation.manual_override_count > 0
      ? `${fleetRecommendation.manual_override_count} manual override(s) are active; review constraint warnings before dispatch.`
      : 'All assets are currently following forecast-driven auto mode.'
  ]

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Recommendation</h2>
        <p className="mt-1 text-sm text-text-secondary">Fleet-level recommendation plus asset-level dispatch context.</p>
      </div>
      <FleetRecommendationSummary recommendation={fleetRecommendation} />
      <RecommendationCards schedule={schedule} />
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
      <ExplanationPanel explanations={explanations} />
    </section>
  )
}
