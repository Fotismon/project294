'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { ApiStatusBanner } from '@/components/dashboard/ApiStatusBanner'
import { AlertCard } from '@/components/dashboard/AlertCard'
import { BacktestPanel } from '@/components/dashboard/BacktestPanel'
import { BatteryStressCard } from '@/components/dashboard/BatteryStressCard'
import { ConstraintPanel } from '@/components/dashboard/ConstraintPanel'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { FleetAlertsPanel } from '@/components/dashboard/FleetAlertsPanel'
import { FleetOverview } from '@/components/dashboard/FleetOverview'
import { FleetManagerSection } from '@/components/dashboard/FleetManagerSection'
import { RecommendationCards } from '@/components/dashboard/RecommendationCards'
import { ScenarioControls } from '@/components/dashboard/ScenarioControls'
import { ConsoleSectionId } from '@/components/dashboard/SideNav'
import { clearApiFallback, getForecast, getLastApiFallback, getSchedule, hasConfiguredApiBaseUrl, runBacktest, runScenario } from '@/lib/api'
import { mockAlerts, mockFleetAssets, mockForecastData, mockScheduleResponse } from '@/lib/mock-data'
import { buildDefaultSchedulerInput } from '@/lib/sample-inputs'
import {
  Alert,
  ApiStatus,
  BacktestResponse,
  BatteryAction,
  BatteryAsset,
  EffectiveBatteryAction,
  FleetForecastAction,
  FleetRecommendation,
  FleetSummary,
  ForecastPoint,
  RiskAppetite,
  ScheduleResponse,
  TemperaturePolicy
} from '@/types/api'

function currentStatusTime(): string {
  return new Date().toLocaleTimeString()
}

function backtestFallbackDetail(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('historical') || lower.includes('csv') || lower.includes('market_prices') || lower.includes('no data')) {
    return 'Historical market data is unavailable for this date.'
  }
  return message
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'Europe/Athens'
  }).format(new Date(`${dateStr}T12:00:00`))
}

function todayAthens(): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Europe/Athens'
  }).format(new Date())
}

function normalizeEfficiency(value: number): number {
  return value > 1 ? value / 100 : value
}

function scheduleAlertsOrFallback(schedule: ScheduleResponse, fallback: Alert[] = []): Alert[] {
  return schedule.alerts?.length ? schedule.alerts : fallback
}

function effectiveAction(asset: BatteryAsset): EffectiveBatteryAction {
  return asset.selected_action === 'auto' ? asset.auto_action : asset.selected_action
}

function calculateFleetSummary(assets: BatteryAsset[]): FleetSummary {
  const totalCapacity = assets.reduce((sum, asset) => sum + asset.capacity_mwh, 0)
  const totalPower = assets.reduce((sum, asset) => sum + asset.power_mw, 0)
  const actions = assets.map(effectiveAction)
  const autoActions = Array.from(new Set(assets.filter((asset) => asset.status !== 'offline').map((asset) => asset.auto_action)))
  const forecastAction: FleetForecastAction = autoActions.length === 1 ? autoActions[0] : 'mixed'

  return {
    total_assets: assets.length,
    available_assets: assets.filter((asset) => asset.status !== 'offline').length,
    total_capacity_mwh: totalCapacity,
    total_power_mw: totalPower,
    average_soc: assets.reduce((sum, asset) => sum + asset.soc, 0) / Math.max(assets.length, 1),
    forecast_driven_action: forecastAction,
    assets_charging: actions.filter((action) => action === 'charge').length,
    assets_discharging: actions.filter((action) => action === 'discharge').length,
    assets_idle: actions.filter((action) => action === 'idle').length,
    expected_value_eur: assets.reduce<[number, number]>(
      (range, asset) => {
        const action = effectiveAction(asset)
        const multiplier = asset.status === 'offline' || action === 'idle' ? 0 : asset.selected_action === 'auto' ? 1 : action === asset.auto_action ? 0.95 : 0.7
        return [
          range[0] + Math.round(asset.expected_value_eur[0] * multiplier),
          range[1] + Math.round(asset.expected_value_eur[1] * multiplier)
        ]
      },
      [0, 0]
    )
  }
}

function calculateFleetRecommendation(assets: BatteryAsset[], summary: FleetSummary): FleetRecommendation {
  const manualAssets = assets.filter((asset) => asset.selected_action !== 'auto')
  const autoValue = assets.reduce<[number, number]>((range, asset) => [range[0] + asset.expected_value_eur[0], range[1] + asset.expected_value_eur[1]], [0, 0])
  const warnings: string[] = []

  manualAssets.forEach((asset) => {
    if (asset.selected_action !== asset.auto_action) warnings.push(`${asset.name}: manual ${asset.selected_action} conflicts with auto ${asset.auto_action}.`)
    if (asset.selected_action === 'discharge' && asset.soc < 0.25) warnings.push(`${asset.name}: low SoC asset should not discharge.`)
    if (asset.stress_level === 'high' && asset.selected_action !== 'idle') warnings.push(`${asset.name}: high stress asset should remain idle.`)
    if (asset.status === 'offline' && asset.selected_action !== 'idle' && asset.selected_action !== 'auto') warnings.push(`${asset.name}: offline asset cannot be manually dispatched.`)
  })

  if (summary.assets_discharging > Math.ceil(assets.length / 2)) warnings.push('Too many batteries are discharging simultaneously.')

  return {
    summary,
    manual_override_count: manualAssets.length,
    override_value_delta_eur: [summary.expected_value_eur[0] - autoValue[0], summary.expected_value_eur[1] - autoValue[1]],
    warnings
  }
}

export default function Home() {
  const [activeSection, setActiveSection] = useState<ConsoleSectionId>('fleet')
  const [scheduleData, setScheduleData] = useState<ScheduleResponse>(mockScheduleResponse)
  const [forecastData, setForecastData] = useState<ForecastPoint[]>(mockForecastData)
  const [alerts, setAlerts] = useState<Alert[]>(mockAlerts)
  const [fleetAssets, setFleetAssets] = useState<BatteryAsset[]>(mockFleetAssets)
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [apiStatus, setApiStatus] = useState<ApiStatus>({
    kind: 'loading',
    message: 'Loading backend data...'
  })

  const [roundTripEfficiency, setRoundTripEfficiency] = useState(90)
  const [batteryDuration, setBatteryDuration] = useState(2)
  const [maxCycles, setMaxCycles] = useState(1)
  const [degradationCost, setDegradationCost] = useState(10)
  const [riskAppetite, setRiskAppetite] = useState<RiskAppetite>('balanced')
  const [temperaturePolicy, setTemperaturePolicy] = useState<TemperaturePolicy>('normal')
  const [isScenarioRunning, setIsScenarioRunning] = useState(false)

  const [backtestDate, setBacktestDate] = useState('2026-04-25')
  const [backtestProfile, setBacktestProfile] = useState<RiskAppetite>('balanced')
  const [backtestResult, setBacktestResult] = useState<BacktestResponse | null>(null)
  const [isBacktestRunning, setIsBacktestRunning] = useState(false)

  const fleetSummary = useMemo(() => calculateFleetSummary(fleetAssets), [fleetAssets])
  const fleetRecommendation = useMemo(() => calculateFleetRecommendation(fleetAssets, fleetSummary), [fleetAssets, fleetSummary])
  const stressDistribution = useMemo(() => ({
    low: fleetAssets.filter((asset) => asset.stress_level === 'low').length,
    medium: fleetAssets.filter((asset) => asset.stress_level === 'medium').length,
    high: fleetAssets.filter((asset) => asset.stress_level === 'high').length
  }), [fleetAssets])

  useEffect(() => {
    let mounted = true

    async function loadDashboard() {
      setIsLoading(true)
      setError(null)
      setApiStatus({
        kind: 'loading',
        message: 'Loading backend data...'
      })
      clearApiFallback()
      try {
        const [schedule, forecast] = await Promise.all([
          getSchedule(mockScheduleResponse.date, 'balanced'),
          getForecast(mockScheduleResponse.date)
        ])
        if (!mounted) return
        setScheduleData(schedule)
        setForecastData(forecast)
        setAlerts(scheduleAlertsOrFallback(schedule, mockAlerts))
        const fallback = getLastApiFallback()
        if (!hasConfiguredApiBaseUrl()) {
          setApiStatus({
            kind: 'mock',
            message: 'Using mock fallback',
            detail: 'NEXT_PUBLIC_API_BASE_URL is not configured.'
          })
        } else if (fallback) {
          setApiStatus({
            kind: 'error',
            message: 'API error - using mock fallback',
            detail: fallback.message,
            last_updated_at: currentStatusTime()
          })
        } else {
          setApiStatus({
            kind: 'connected',
            message: 'Backend connected',
            detail: 'Using live schedule and forecast responses.',
            last_updated_at: currentStatusTime()
          })
        }
      } catch (loadError) {
        if (!mounted) return
        const detail = loadError instanceof Error ? loadError.message : String(loadError)
        setError('Unable to load live API data. Showing local mock data.')
        setScheduleData(mockScheduleResponse)
        setForecastData(mockForecastData)
        setAlerts(scheduleAlertsOrFallback(mockScheduleResponse, mockAlerts))
        setApiStatus({
          kind: 'error',
          message: 'API error - using mock fallback',
          detail,
          last_updated_at: currentStatusTime()
        })
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    loadDashboard()
    return () => {
      mounted = false
    }
  }, [])

  function handleToggleSelected(id: string) {
    setSelectedAssetIds((current) => current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id])
  }

  function handleAssetActionChange(id: string, action: BatteryAction) {
    setFleetAssets((current) => current.map((asset) => asset.id === id ? { ...asset, selected_action: action } : asset))
  }

  function handleApplyBulkAction(action: BatteryAction) {
    setFleetAssets((current) => current.map((asset) => selectedAssetIds.includes(asset.id) ? { ...asset, selected_action: action } : asset))
  }

  async function handleRunScenario() {
    setIsScenarioRunning(true)
    setError(null)
    setApiStatus({
      kind: 'loading',
      message: 'Running scenario...',
      detail: 'Calling /scenario with current assumptions.'
    })
    clearApiFallback()
    try {
      const schedulerInput = buildDefaultSchedulerInput()
      const result = await runScenario(
        {
          date: scheduleData.date,
          profile_name: riskAppetite,
          prices: schedulerInput.prices,
          temperatures: schedulerInput.temperatures,
          round_trip_efficiency: normalizeEfficiency(roundTripEfficiency),
          duration_hours: batteryDuration,
          max_cycles_per_day: maxCycles,
          degradation_cost_eur_per_mwh: degradationCost,
          risk_appetite: riskAppetite,
          temperature_policy: temperaturePolicy,
          forecast_confidence: schedulerInput.forecast_confidence,
          market_volatility: schedulerInput.market_volatility,
          forecast_uncertainty_width: schedulerInput.forecast_uncertainty_width,
          data_quality_level: schedulerInput.data_quality_level,
          minimum_margin_eur_per_mwh: schedulerInput.minimum_margin_eur_per_mwh
        },
        scheduleData
      )
      setScheduleData(result)
      setAlerts(scheduleAlertsOrFallback(result))
      const fallback = getLastApiFallback()
      if (!hasConfiguredApiBaseUrl()) {
        setApiStatus({
          kind: 'mock',
          message: 'Using mock fallback',
          detail: 'NEXT_PUBLIC_API_BASE_URL is not configured.'
        })
      } else if (fallback) {
        setApiStatus({
          kind: 'error',
          message: 'Scenario API error - using mock fallback',
          detail: fallback.message,
          last_updated_at: currentStatusTime()
        })
      } else {
        setApiStatus({
          kind: 'connected',
          message: 'Backend connected',
          detail: 'Scenario result returned from /scenario.',
          last_updated_at: currentStatusTime()
        })
      }
    } catch (scenarioError) {
      const detail = scenarioError instanceof Error ? scenarioError.message : String(scenarioError)
      setError('Scenario API failed. Local mock scenario is still available.')
      setApiStatus({
        kind: 'error',
        message: 'Scenario API error - using mock fallback',
        detail,
        last_updated_at: currentStatusTime()
      })
    } finally {
      setIsScenarioRunning(false)
    }
  }

  async function handleRunBacktest() {
    setIsBacktestRunning(true)
    setError(null)
    setApiStatus({
      kind: 'loading',
      message: 'Running backtest...',
      detail: 'Calling /backtest.'
    })
    clearApiFallback()
    try {
      const result = await runBacktest({
        date: backtestDate,
        profile_name: backtestProfile,
        lookback_days: 7,
        forecast_method: 'lookback_average',
        market_volatility: 'medium',
        data_quality_level: 'medium',
        minimum_margin_eur_per_mwh: 2
      })
      setBacktestResult(result)
      const fallback = getLastApiFallback()
      if (!hasConfiguredApiBaseUrl()) {
        setApiStatus({
          kind: 'mock',
          message: 'Using mock fallback',
          detail: 'NEXT_PUBLIC_API_BASE_URL is not configured.'
        })
      } else if (fallback) {
        setError('Backtest data unavailable. Showing mock backtest result.')
        setApiStatus({
          kind: 'error',
          message: 'Backtest API error - using mock fallback',
          detail: backtestFallbackDetail(fallback.message),
          last_updated_at: currentStatusTime()
        })
      } else {
        setApiStatus({
          kind: 'connected',
          message: 'Backend connected',
          detail: 'Backtest result returned from /backtest.',
          last_updated_at: currentStatusTime()
        })
      }
    } catch (backtestError) {
      const detail = backtestError instanceof Error ? backtestError.message : String(backtestError)
      setError('Backtest data unavailable. Showing mock backtest result.')
      setApiStatus({
        kind: 'error',
        message: 'Backtest API error - using mock fallback',
        detail: backtestFallbackDetail(detail),
        last_updated_at: currentStatusTime()
      })
    } finally {
      setIsBacktestRunning(false)
    }
  }

  return (
    <DashboardShell
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      apiStatus={apiStatus}
      currentDateLabel={`Athens ${formatDate(todayAthens())}`}
      marketZone="GR Day-Ahead"
    >
      {apiStatus.kind !== 'connected' && <ApiStatusBanner status={apiStatus} />}

      {(isLoading || error) && (
        <div className="mb-4 border border-border bg-surface-elevated/50 px-4 py-3 text-sm text-text-secondary">
          {isLoading ? 'Loading schedule, forecast, and alerts...' : error}
        </div>
      )}

      <div>
        {activeSection === 'fleet' && (
          <FleetOverview
            schedule={scheduleData}
            forecastData={forecastData}
            fleetAssets={fleetAssets}
            alerts={alerts}
            fleetSummary={fleetSummary}
            fleetRecommendation={fleetRecommendation}
            selectedAssetIds={selectedAssetIds}
            onSelectAll={() => setSelectedAssetIds(fleetAssets.map((asset) => asset.id))}
            onClearSelection={() => setSelectedAssetIds([])}
            onToggleSelected={handleToggleSelected}
            onApplyAction={handleApplyBulkAction}
            onAssetActionChange={handleAssetActionChange}
          />
        )}

        {activeSection === 'assets' && (
          <div className="space-y-6">
            <SectionHeader title="Battery Assets" subtitle="Asset-level controls, status, and operating decisions." />
            <FleetManagerSection
              assets={fleetAssets}
              summary={fleetSummary}
              selectedIds={selectedAssetIds}
              onSelectAll={() => setSelectedAssetIds(fleetAssets.map((asset) => asset.id))}
              onClearSelection={() => setSelectedAssetIds([])}
              onToggleSelected={handleToggleSelected}
              onApplyAction={handleApplyBulkAction}
              onAssetActionChange={handleAssetActionChange}
            />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ConstraintPanel constraints={scheduleData.physical_constraints} />
              <BatteryStressCard stress={scheduleData.battery_stress} />
            </div>
          </div>
        )}

        {activeSection === 'scenario' && (
          <div className="space-y-6">
            <SectionHeader title="Scenario Analyst" subtitle="Test operating assumptions before committing a battery schedule." />
            <ScenarioControls
              roundTripEfficiency={roundTripEfficiency}
              onRoundTripEfficiencyChange={setRoundTripEfficiency}
              batteryDuration={batteryDuration}
              onBatteryDurationChange={setBatteryDuration}
              maxCycles={maxCycles}
              onMaxCyclesChange={setMaxCycles}
              degradationCost={degradationCost}
              onDegradationCostChange={setDegradationCost}
              riskAppetite={riskAppetite}
              onRiskAppetiteChange={setRiskAppetite}
              temperaturePolicy={temperaturePolicy}
              onTemperaturePolicyChange={setTemperaturePolicy}
              onRunScenario={handleRunScenario}
              isRunning={isScenarioRunning}
            />
            <RecommendationCards schedule={scheduleData} />
            <div className="rounded-lg border border-border bg-surface-elevated/50 p-4">
              <h3 className="mb-3 text-xs uppercase tracking-wider text-text-secondary">Fleet Impact Preview</h3>
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
                <PreviewItem label="Assets Affected" value={fleetAssets.length} />
                <PreviewItem label="Fleet Value" value={`€${fleetSummary.expected_value_eur[0]}-€${fleetSummary.expected_value_eur[1]}`} />
                <PreviewItem label="Stress Low/Med/High" value={`${stressDistribution.low}/${stressDistribution.medium}/${stressDistribution.high}`} />
                <PreviewItem label="Charge/Discharge/Idle" value={`${fleetSummary.assets_charging}/${fleetSummary.assets_discharging}/${fleetSummary.assets_idle}`} />
                <PreviewItem label="Manual Overrides" value={fleetRecommendation.manual_override_count} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ConstraintPanel constraints={scheduleData.physical_constraints} />
              <BatteryStressCard stress={scheduleData.battery_stress} />
            </div>
            {scheduleData.alerts.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs uppercase tracking-wider text-text-secondary">Scenario Alerts</h3>
                {scheduleData.alerts.map((alert) => (
                  <AlertCard key={`${alert.severity}-${alert.title}`} alert={alert} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeSection === 'alerts' && (
          <div className="space-y-6">
            <SectionHeader title="Alerts" subtitle="Operational risks from the latest schedule or scenario." />
            <FleetAlertsPanel alerts={alerts} assets={fleetAssets} />
          </div>
        )}

        {activeSection === 'backtest' && (
          <div className="space-y-6">
            <SectionHeader title="Backtest" subtitle="Replay historical recommendations against realized prices." />
            <BacktestPanel
              date={backtestDate}
              onDateChange={setBacktestDate}
              profile={backtestProfile}
              onProfileChange={setBacktestProfile}
              onRunBacktest={handleRunBacktest}
              isRunning={isBacktestRunning}
              result={backtestResult}
              assets={fleetAssets}
            />
          </div>
        )}
      </div>
    </DashboardShell>
  )
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-2xl font-semibold text-text-primary">{title}</h2>
      <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>
    </div>
  )
}

function PreviewItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-1 text-base font-semibold text-text-primary">{value}</p>
    </div>
  )
}
