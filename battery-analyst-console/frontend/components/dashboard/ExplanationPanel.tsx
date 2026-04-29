'use client'

import React from 'react'

interface ExplanationPanelProps {
  explanations: string[]
}

export function ExplanationPanel({ explanations }: ExplanationPanelProps) {
  return (
    <div className="border border-border rounded-lg bg-surface-elevated/50 p-4">
      <h3 className="text-text-secondary text-xs uppercase tracking-wider mb-3">
        Why This Recommendation?
      </h3>
      <div className="space-y-3">
        {explanations.length === 0 ? (
          <p className="text-text-muted text-sm">No explanation provided.</p>
        ) : explanations.map((explanation, index) => (
          <div key={index} className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-info/20 text-info text-xs flex items-center justify-center font-medium">
              {index + 1}
            </span>
            <p className="text-text-primary text-sm leading-relaxed">{explanation}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
