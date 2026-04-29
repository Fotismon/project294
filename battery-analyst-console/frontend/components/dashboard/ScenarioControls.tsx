'use client'

import React from 'react'
import { RiskAppetite, TemperaturePolicy } from '@/types/api'

interface ScenarioControlsProps {
  roundTripEfficiency: number
  onRoundTripEfficiencyChange: (value: number) => void
  batteryDuration: number
  onBatteryDurationChange: (value: number) => void
  maxCycles: number
  onMaxCyclesChange: (value: number) => void
  degradationCost: number
  onDegradationCostChange: (value: number) => void
  riskAppetite: RiskAppetite
  onRiskAppetiteChange: (value: RiskAppetite) => void
  temperaturePolicy: TemperaturePolicy
  onTemperaturePolicyChange: (value: TemperaturePolicy) => void
  onRunScenario: () => void
  isRunning?: boolean
}

export function ScenarioControls({
  roundTripEfficiency,
  onRoundTripEfficiencyChange,
  batteryDuration,
  onBatteryDurationChange,
  maxCycles,
  onMaxCyclesChange,
  degradationCost,
  onDegradationCostChange,
  riskAppetite,
  onRiskAppetiteChange,
  temperaturePolicy,
  onTemperaturePolicyChange,
  onRunScenario,
  isRunning = false
}: ScenarioControlsProps) {
  const riskAppetiteDescription: Record<RiskAppetite, string> = {
    conservative: 'Conservative risk appetite increases required margin.',
    balanced: 'Balanced risk appetite keeps the standard required margin.',
    aggressive: 'Aggressive risk appetite lowers required margin.'
  }
  const temperaturePolicyDescription: Record<TemperaturePolicy, string> = {
    relaxed: 'Relaxed policy allows slightly warmer operating windows.',
    normal: 'Normal policy uses standard temperature thresholds.',
    strict: 'Strict temperature policy avoids warmer operating windows.'
  }

  return (
    <div className="rounded-lg border border-border bg-surface-elevated/50 p-4">
      <div className="mb-4">
        <h3 className="text-xs uppercase tracking-wider text-text-secondary">Scenario assumptions</h3>
        <p className="mt-1 text-xs text-text-muted">Adjust operating assumptions and recompute the recommendation.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="mb-2 block text-xs text-text-secondary">Round-trip efficiency: {roundTripEfficiency}%</label>
          <input
            type="range"
            min="70"
            max="95"
            value={roundTripEfficiency}
            onChange={(event) => onRoundTripEfficiencyChange(Number(event.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-surface accent-info"
          />
          <div className="mt-1 flex justify-between text-xs text-text-muted">
            <span>70%</span>
            <span>95%</span>
          </div>
        </div>

        <SelectControl label="Duration hours" value={batteryDuration} onChange={(value) => onBatteryDurationChange(Number(value))}>
          <option value={1}>1h</option>
          <option value={2}>2h</option>
          <option value={3}>3h</option>
          <option value={4}>4h</option>
        </SelectControl>

        <SelectControl label="Max cycles per day" value={maxCycles} onChange={(value) => onMaxCyclesChange(Number(value))}>
          <option value={1}>1 cycle</option>
          <option value={2}>2 cycles</option>
        </SelectControl>

        <div>
          <label className="mb-2 block text-xs text-text-secondary">Degradation cost €/MWh</label>
          <input
            type="number"
            min="0"
            max="100"
            value={degradationCost}
            onChange={(event) => onDegradationCostChange(Number(event.target.value))}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
          />
        </div>

        <SelectControl
          label="Risk appetite"
          value={riskAppetite}
          onChange={(value) => onRiskAppetiteChange(value as RiskAppetite)}
          description={riskAppetiteDescription[riskAppetite]}
        >
          <option value="conservative">Conservative</option>
          <option value="balanced">Balanced</option>
          <option value="aggressive">Aggressive</option>
        </SelectControl>

        <SelectControl
          label="Temperature policy"
          value={temperaturePolicy}
          onChange={(value) => onTemperaturePolicyChange(value as TemperaturePolicy)}
          description={temperaturePolicyDescription[temperaturePolicy]}
        >
          <option value="relaxed">Relaxed</option>
          <option value="normal">Normal</option>
          <option value="strict">Strict</option>
        </SelectControl>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <button
          onClick={onRunScenario}
          disabled={isRunning}
          className={`rounded-lg px-6 py-2 text-sm font-medium transition ${
            isRunning ? 'cursor-not-allowed bg-surface-elevated text-text-muted' : 'bg-info text-white hover:bg-info/80'
          }`}
        >
          {isRunning ? 'Running...' : 'Run Scenario'}
        </button>
      </div>
    </div>
  )
}

function SelectControl({
  label,
  value,
  onChange,
  description,
  children
}: {
  label: string
  value: string | number
  onChange: (value: string) => void
  description?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-2 block text-xs text-text-secondary">{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
      >
        {children}
      </select>
      {description && <p className="mt-2 text-xs leading-relaxed text-text-muted">{description}</p>}
    </div>
  )
}
