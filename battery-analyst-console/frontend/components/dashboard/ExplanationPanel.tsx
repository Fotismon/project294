'use client'

import React from 'react'
import { EmptyState, SectionPanel } from '@/components/ui'

interface ExplanationPanelProps {
  explanations: string[]
}

export function ExplanationPanel({ explanations }: ExplanationPanelProps) {
  return (
    <SectionPanel title="Why this recommendation?" subtitle="Scheduler rationale returned with the current decision.">
      {explanations.length === 0 ? (
        <EmptyState title="No explanation provided." />
      ) : (
        <ol className="space-y-3">
          {explanations.map((explanation, index) => (
            <li key={index} className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center border border-info/30 bg-info/10 text-xs font-medium text-info">
                {index + 1}
              </span>
              <p className="text-sm leading-relaxed text-text-primary">{explanation}</p>
            </li>
          ))}
        </ol>
      )}
    </SectionPanel>
  )
}
