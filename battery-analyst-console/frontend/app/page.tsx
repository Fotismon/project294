'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { ApiStatusBanner } from '@/components/dashboard/ApiStatusBanner'
import { AlertCard } from '@/components/dashboard/AlertCard'
import { BacktestPanel } from '@/components/dashboard/BacktestPanel'
import { BatteryAssetDetailPanel } from '@/components/dashboard/BatteryAssetDetailPanel'
import { BatteryStressCard } from '@/components/dashboard/BatteryStressCard'
import { ConstraintPanel } from '@/components/dashboard/ConstraintPanel'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { DispatchDiagnosticsPanel } from '@/components/dashboard/DispatchDiagnosticsPanel'
import { FleetAlertsPanel } from '@/components/dashboard/FleetAlertsPanel'
import { FleetOverview } from '@/components/dashboard/FleetOverview'
import { FleetManagerSection } from '@/components/dashboard/FleetManagerSection'
import { NoActionPanel } from '@/components/dashboard/NoActionPanel'
import { OptimizerBadge } from '@/components/dashboard/OptimizerBadge'
import { RecommendationCards } from '@/components/dashboard/RecommendationCards'
import { ScenarioComparisonPanel } from '@/components/dashboard/ScenarioComparisonPanel'
import { ScenarioControls } from '@/components/dashboard/ScenarioControls'
import { ConsoleSectionId } from '@/components/dashboard/SideNav'
import { clearApiFallback, getBacktestCoverage, getFleet, getForecast, getLastApiFallback, getSchedule, hasConfiguredApiBaseUrl, runBacktest, runScenario } from '@/lib/api'
import {
  Alert,
  ApiStatus,
  BacktestCoverage,
  BacktestResponse,
  BatteryAction,
  BatteryAsset,
  EffectiveBatteryAction,
  FleetForecastAction,
  FleetRecommendation,
  FleetSummary,
  ForecastPoint,
  OptimizerMode,
  RiskAppetite,
  ScheduleResponse,
  TemperaturePolicy
} from '@/types/api'

function currentStatusTime(): string {
  return new Date().toLocaleTimeString()
}

function backtestFallbackDetail(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('available range')) return message
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

function tomorrowAthens(): string {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Europe/Athens'
  }).format(tomorrow)
}

function dateWithinCoverage(date: string, coverage: BacktestCoverage | null): boolean {
  if (!coverage?.earliest_date || !coverage.latest_date) return true
  return date >= coverage.earliest_date && date <= coverage.latest_date
}

function normalizeEfficiency(value: number): number {
  return value > 1 ? value / 100 : value
}

function scheduleAlertsOrFallback(schedule: ScheduleResponse, fallback: Alert[] = []): Alert[] {
  return schedule.alerts?.length ? schedule.alerts : fallback
}

function forecastPrices(points: ForecastPoint[]): number[] {
  return points.map((point) => point.p50_price)
}

function forecastUncertaintyWidth(points: ForecastPoint[]): number | null {
  if (points.length === 0) return null
  const totalWidth = points.reduce((sum, point) => sum + Math.max(0, point.p90_price - point.p10_price), 0)
  return Math.round((totalWidth / points.length) * 10) / 10
}

function forecastConfidence(points: ForecastPoint[]): ScheduleResponse['confidence'] {
  const width = forecastUncertaintyWidth(points)
  if (width == null) return 'medium'
  if (width <= 20) return 'high'
  if (width <= 50) return 'medium'
  return 'low'
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
  const [scheduleData, setScheduleData] = useState<ScheduleResponse | null>(null)
  const [forecastData, setForecastData] = useState<ForecastPoint[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [fleetAssets, setFleetAssets] = useState<BatteryAsset[]>([])
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([])
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [apiStatus, setApiStatus] = useState<ApiStatus>({
    kind: 'loading',
    message: 'Loading operating data...'
  })

  const [roundTripEfficiency, setRoundTripEfficiency] = useState(90)
  const [batteryDuration, setBatteryDuration] = useState(2)
  const [maxCycles, setMaxCycles] = useState(1)
  const [degradationCost, setDegradationCost] = useState(10)
  const [riskAppetite, setRiskAppetite] = useState<RiskAppetite>('balanced')
  const [temperaturePolicy, setTemperaturePolicy] = useState<TemperaturePolicy>('normal')
  const [optimizerMode, setOptimizerMode] = useState<OptimizerMode>('window_v1')
  const [isScenarioRunning, setIsScenarioRunning] = useState(false)
  const [baseScenarioSchedule, setBaseScenarioSchedule] = useState<ScheduleResponse | null>(null)
  const [scenarioResult, setScenarioResult] = useState<ScheduleResponse | null>(null)

  const [backtestDate, setBacktestDate] = useState('2026-04-25')
  const [backtestProfile, setBacktestProfile] = useState<RiskAppetite>('balanced')
  const [backtestResult, setBacktestResult] = useState<BacktestResponse | null>(null)
  const [backtestCoverage, setBacktestCoverage] = useState<BacktestCoverage | null>(null)
  const [isBacktestRunning, setIsBacktestRunning] = useState(false)

  const fleetSummary = useMemo(() => calculateFleetSummary(fleetAssets), [fleetAssets])
  const fleetRecommendation = useMemo(() => calculateFleetRecommendation(fleetAssets, fleetSummary), [fleetAssets, fleetSummary])
  const selectedAsset = useMemo(
    () => fleetAssets.find((asset) => asset.id === selectedAssetId) ?? null,
    [fleetAssets, selectedAssetId]
  )
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
        message: 'Loading operating data...'
      })
      clearApiFallback()
      try {
        const operatingDate = tomorrowAthens()

        const [schedule, forecast, fleet, coverage] = await Promise.all([
          getSchedule(operatingDate, 'balanced', optimizerMode),
          getForecast(operatingDate),
          getFleet(),
          getBacktestCoverage()
        ])
        if (!mounted) return
        setScheduleData(schedule)
        setForecastData(forecast)
        setFleetAssets(fleet.assets)
        setBacktestCoverage(coverage)
        setBacktestDate((currentDate) => (
          dateWithinCoverage(currentDate, coverage)
            ? currentDate
            : coverage.latest_date ?? currentDate
        ))
        setAlerts(scheduleAlertsOrFallback(schedule))
        const fallback = getLastApiFallback()
        if (!hasConfiguredApiBaseUrl()) {
          setApiStatus({
            kind: 'error',
            message: 'Live API not configured',
            detail: 'NEXT_PUBLIC_API_BASE_URL is required so the app can use the backend forecast service.'
          })
        } else if (fallback) {
          setApiStatus({
            kind: 'error',
            message: 'Live API unavailable',
            detail: fallback.message,
            last_updated_at: currentStatusTime()
          })
        } else {
          setApiStatus({
            kind: 'connected',
            message: 'Live backend connected',
            detail: 'Using live schedule and forecast responses.',
            last_updated_at: currentStatusTime()
          })
        }
      } catch (loadError) {
        if (!mounted) return
        const detail = loadError instanceof Error ? loadError.message : String(loadError)
        setError('Unable to load live weather-backed forecast data. Configure the backend and retry.')
        setScheduleData(null)
        setForecastData([])
        setAlerts([])
        setApiStatus({
          kind: 'error',
          message: 'Live API unavailable',
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
  }, [optimizerMode])

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
    if (!scheduleData) {
      setError('Load a live schedule before running scenarios.')
      return
    }

    const prices = forecastPrices(forecastData)
    if (prices.length !== 96) {
      setError('Scenario requires 96 live forecast intervals from /forecast.')
      return
    }

    setIsScenarioRunning(true)
    setError(null)
    setApiStatus({
      kind: 'loading',
      message: 'Recomputing recommendation...',
      detail: 'Calling /scenario with current assumptions.'
    })
    clearApiFallback()
    try {
      setBaseScenarioSchedule(scheduleData)
      const result = await runScenario({
        date: scheduleData.date,
        profile_name: riskAppetite,
        prices,
        temperatures: null,
        round_trip_efficiency: normalizeEfficiency(roundTripEfficiency),
        duration_hours: batteryDuration,
        max_cycles_per_day: maxCycles,
        degradation_cost_eur_per_mwh: degradationCost,
        risk_appetite: riskAppetite,
        temperature_policy: temperaturePolicy,
        optimizer_mode: optimizerMode,
        forecast_confidence: forecastConfidence(forecastData),
        market_volatility: 'medium',
        forecast_uncertainty_width: forecastUncertaintyWidth(forecastData),
        data_quality_level: 'high',
        minimum_margin_eur_per_mwh: 2
      })
      setScenarioResult(result)
      setScheduleData(result)
      setAlerts(scheduleAlertsOrFallback(result))
        const fallback = getLastApiFallback()
        if (!hasConfiguredApiBaseUrl()) {
          setApiStatus({
            kind: 'error',
            message: 'Live API not configured',
            detail: 'NEXT_PUBLIC_API_BASE_URL is required so scenarios can use the backend forecast service.'
          })
      } else if (fallback) {
        setApiStatus({
          kind: 'error',
          message: 'Scenario service unavailable',
          detail: fallback.message,
          last_updated_at: currentStatusTime()
        })
      } else {
        setApiStatus({
          kind: 'connected',
          message: 'Live backend connected',
          detail: 'Scenario result returned from /scenario.',
          last_updated_at: currentStatusTime()
        })
      }
    } catch (scenarioError) {
      const detail = scenarioError instanceof Error ? scenarioError.message : String(scenarioError)
      setError('Scenario service unavailable. No hardcoded scenario data was used.')
      setApiStatus({
        kind: 'error',
        message: 'Scenario service unavailable',
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
      if (!dateWithinCoverage(backtestDate, backtestCoverage)) {
        throw new Error(
          `No realized market price data found for date ${backtestDate}. ` +
          `Available range is ${backtestCoverage?.earliest_date} to ${backtestCoverage?.latest_date}.`
        )
      }
      const result = await runBacktest({
        date: backtestDate,
        profile_name: backtestProfile,
        lookback_days: 7,
        forecast_method: 'lookback_average',
        optimizer_mode: optimizerMode,
        market_volatility: 'medium',
        data_quality_level: 'medium',
        minimum_margin_eur_per_mwh: 2
      })
      setBacktestResult(result)
      const fallback = getLastApiFallback()
      if (!hasConfiguredApiBaseUrl()) {
        setApiStatus({
          kind: 'error',
          message: 'Live API not configured',
          detail: 'NEXT_PUBLIC_API_BASE_URL is required for backtesting.'
        })
      } else if (fallback) {
        setError('Backtest data unavailable. No hardcoded backtest result was used.')
        setApiStatus({
          kind: 'error',
          message: 'Backtest data unavailable',
          detail: backtestFallbackDetail(fallback.message),
          last_updated_at: currentStatusTime()
        })
      } else {
        setApiStatus({
          kind: 'connected',
          message: 'Live backend connected',
          detail: 'Backtest result returned from /backtest.',
          last_updated_at: currentStatusTime()
        })
      }
    } catch (backtestError) {
      const detail = backtestError instanceof Error ? backtestError.message : String(backtestError)
      setError('Backtest data unavailable. No hardcoded backtest result was used.')
      setApiStatus({
        kind: 'error',
        message: 'Backtest data unavailable',
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
      currentDateLabel={`Athens ${formatDate(tomorrowAthens())}`}
      marketZone="GR Day-Ahead"
    >
      {apiStatus.kind !== 'connected' && <ApiStatusBanner status={apiStatus} />}

      {(isLoading || error) && (
        <div className="mb-4 border border-border bg-surface-elevated/50 px-4 py-3 text-sm text-text-secondary">
          {isLoading ? 'Loading schedule, forecast, and operational alerts...' : error}
        </div>
      )}

      <div>
        {activeSection === 'fleet' && scheduleData && (
          <FleetOverview
            schedule={scheduleData}
            forecastData={forecastData}
            fleetAssets={fleetAssets}
            alerts={alerts}
            fleetSummary={fleetSummary}
            fleetRecommendation={fleetRecommendation}
            selectedAssetIds={selectedAssetIds}
            selectedAssetId={selectedAssetId}
            selectedAsset={selectedAsset}
            onSelectAll={() => setSelectedAssetIds(fleetAssets.map((asset) => asset.id))}
            onClearSelection={() => setSelectedAssetIds([])}
            onToggleSelected={handleToggleSelected}
            onApplyAction={handleApplyBulkAction}
            onAssetActionChange={handleAssetActionChange}
            onOpenAssetDetail={setSelectedAssetId}
            onCloseAssetDetail={() => setSelectedAssetId(null)}
            optimizerMode={optimizerMode}
            onOptimizerModeChange={setOptimizerMode}
            isOptimizerLoading={isLoading}
          />
        )}
        {activeSection === 'fleet' && !scheduleData && <LiveDataUnavailablePanel />}

        {activeSection === 'assets' && scheduleData && (
          <div className="space-y-6">
            <SectionHeader title="Battery Assets" subtitle="Asset-level controls, status, and operating decisions." />
            <FleetManagerSection
              assets={fleetAssets}
              summary={fleetSummary}
              selectedIds={selectedAssetIds}
              selectedAssetId={selectedAssetId}
              onSelectAll={() => setSelectedAssetIds(fleetAssets.map((asset) => asset.id))}
              onClearSelection={() => setSelectedAssetIds([])}
              onToggleSelected={handleToggleSelected}
              onApplyAction={handleApplyBulkAction}
              onAssetActionChange={handleAssetActionChange}
              onOpenAssetDetail={setSelectedAssetId}
            />
            <BatteryAssetDetailPanel asset={selectedAsset} schedule={scheduleData} onClose={() => setSelectedAssetId(null)} />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ConstraintPanel constraints={scheduleData.physical_constraints} />
              <BatteryStressCard stress={scheduleData.battery_stress} />
            </div>
          </div>
        )}
        {activeSection === 'assets' && !scheduleData && <LiveDataUnavailablePanel />}

        {activeSection === 'scenario' && scheduleData && (
          <div className="space-y-6">
            <SectionHeader title="Scenario Analyst" subtitle="Test operating assumptions before committing a battery schedule." />
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
              <div>
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
                  optimizerMode={optimizerMode}
                  onOptimizerModeChange={setOptimizerMode}
                  onRunScenario={handleRunScenario}
                  isRunning={isScenarioRunning}
                />
              </div>

              <div className="space-y-4">
                <div className="border border-border bg-surface-elevated/50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-text-secondary">Result summary</p>
                      <p className="mt-1 text-sm text-text-muted">
                        {scenarioResult ? 'Latest scenario result is now the active schedule.' : 'Recompute a recommendation to compare against the base case.'}
                      </p>
                    </div>
                    <OptimizerBadge optimizer={scheduleData.optimizer} />
                  </div>
                </div>

                {scheduleData.decision === 'hold' ? (
                  <NoActionPanel schedule={scheduleData} />
                ) : (
                  <RecommendationCards schedule={scheduleData} />
                )}
              </div>
            </div>

            <ScenarioComparisonPanel
              baseSchedule={baseScenarioSchedule}
              scenarioSchedule={scenarioResult}
            />

            <DispatchDiagnosticsPanel diagnostics={scheduleData.diagnostics} optimizer={scheduleData.optimizer} />

            <div className="border border-border bg-surface-elevated/50 p-4">
              <h3 className="text-xs uppercase tracking-wider text-text-secondary">Scenario reasoning</h3>
              {scheduleData.explanation.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {scheduleData.explanation.slice(0, 5).map((reason) => (
                    <li key={reason} className="text-sm leading-relaxed text-text-secondary">- {reason}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-text-muted">No scenario explanation returned.</p>
              )}
            </div>

            <div className="rounded-lg border border-border bg-surface-elevated/50 p-4">
              <h3 className="mb-3 text-xs uppercase tracking-wider text-text-secondary">Fleet Impact Preview</h3>
              <div className="grid grid-cols-2 gap-3 text-sm xl:grid-cols-5">
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
        {activeSection === 'scenario' && !scheduleData && <LiveDataUnavailablePanel />}

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
              coverage={backtestCoverage}
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

function LiveDataUnavailablePanel() {
  return (
    <div className="border border-error/30 bg-error/10 p-4">
      <h2 className="text-lg font-semibold text-error">Live forecast data unavailable</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary">
        The console now requires live backend responses from the weather-backed forecast pipeline. Configure
        NEXT_PUBLIC_API_BASE_URL and make sure the backend /forecast and /schedule endpoints are running.
      </p>
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
