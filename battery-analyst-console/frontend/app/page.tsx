'use client'

import React, { useEffect, useState } from 'react'
import { AlertCard } from '@/components/dashboard/AlertCard'
import { AlternativesPanel } from '@/components/dashboard/AlternativesPanel'
import { BacktestPanel } from '@/components/dashboard/BacktestPanel'
import { BatteryStressCard } from '@/components/dashboard/BatteryStressCard'
import { ConstraintPanel } from '@/components/dashboard/ConstraintPanel'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { ExplanationPanel } from '@/components/dashboard/ExplanationPanel'
import { ForecastChart } from '@/components/dashboard/ForecastChart'
import { RecommendationCards } from '@/components/dashboard/RecommendationCards'
import { ScenarioControls } from '@/components/dashboard/ScenarioControls'
import { SoCFeasibilityCard } from '@/components/dashboard/SoCFeasibilityCard'
import { TabId, TabNav } from '@/components/dashboard/TabNav'
import { getAlerts, getForecast, getSchedule, isUsingMockData, runBacktest, runScenario } from '@/lib/api'
import { mockAlerts, mockForecastData, mockScheduleResponse } from '@/lib/mock-data'
import { Alert, BacktestResponse, ForecastPoint, RiskAppetite, ScheduleResponse, TemperaturePolicy } from '@/types/api'

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

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>('today')
  const [scheduleData, setScheduleData] = useState<ScheduleResponse>(mockScheduleResponse)
  const [forecastData, setForecastData] = useState<ForecastPoint[]>(mockForecastData)
  const [alerts, setAlerts] = useState<Alert[]>(mockAlerts)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [roundTripEfficiency, setRoundTripEfficiency] = useState(90)
  const [batteryDuration, setBatteryDuration] = useState(2)
  const [maxCycles, setMaxCycles] = useState(1)
  const [degradationCost, setDegradationCost] = useState(10)
  const [riskAppetite, setRiskAppetite] = useState<RiskAppetite>('balanced')
  const [temperaturePolicy, setTemperaturePolicy] = useState<TemperaturePolicy>('balanced')
  const [isScenarioRunning, setIsScenarioRunning] = useState(false)

  const [backtestDate, setBacktestDate] = useState('2026-04-25')
  const [backtestProfile, setBacktestProfile] = useState<RiskAppetite>('balanced')
  const [backtestResult, setBacktestResult] = useState<BacktestResponse | null>(null)
  const [isBacktestRunning, setIsBacktestRunning] = useState(false)

  useEffect(() => {
    let mounted = true

    async function loadDashboard() {
      setIsLoading(true)
      setError(null)
      try {
        const [schedule, forecast, alertData] = await Promise.all([
          getSchedule(mockScheduleResponse.date, 'balanced'),
          getForecast(mockScheduleResponse.date),
          getAlerts()
        ])
        if (!mounted) return
        setScheduleData(schedule)
        setForecastData(forecast)
        setAlerts(alertData)
      } catch (loadError) {
        if (!mounted) return
        setError('Unable to load live API data. Showing local mock data.')
        setScheduleData(mockScheduleResponse)
        setForecastData(mockForecastData)
        setAlerts(mockAlerts)
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    loadDashboard()
    return () => {
      mounted = false
    }
  }, [])

  async function handleRunScenario() {
    setIsScenarioRunning(true)
    setError(null)
    try {
      const result = await runScenario({
        date: scheduleData.date,
        battery_profile: riskAppetite,
        round_trip_efficiency: roundTripEfficiency,
        battery_duration_hours: batteryDuration,
        max_cycles_per_day: maxCycles,
        degradation_cost_eur_per_cycle: degradationCost,
        risk_appetite: riskAppetite,
        temperature_policy: temperaturePolicy
      })
      setScheduleData(result)
    } catch {
      setError('Scenario API failed. Local mock scenario is still available.')
    } finally {
      setIsScenarioRunning(false)
    }
  }

  async function handleRunBacktest() {
    setIsBacktestRunning(true)
    setError(null)
    try {
      const result = await runBacktest({ date: backtestDate, battery_profile: backtestProfile })
      setBacktestResult(result)
    } catch {
      setError('Backtest API failed. Showing mock backtest result.')
    } finally {
      setIsBacktestRunning(false)
    }
  }

  const groupedAlerts = {
    critical: alerts.filter((alert) => alert.severity === 'critical'),
    warning: alerts.filter((alert) => alert.severity === 'warning'),
    info: alerts.filter((alert) => alert.severity === 'info')
  }

  return (
    <DashboardShell>
      <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Battery Analyst Console</h1>
          <p className="mt-1 text-sm text-text-secondary">Forecasting is a commodity. Decision support is the product.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-border bg-surface-elevated px-3 py-1 text-sm text-text-secondary">
            Athens {formatDate(todayAthens())}
          </span>
          <span className="rounded-lg border border-border bg-surface-elevated px-3 py-1 text-sm text-text-secondary">
            {isUsingMockData() ? 'Mock data' : 'API first'}
          </span>
        </div>
      </header>

      <TabNav activeTab={activeTab} onTabChange={setActiveTab} />

      {(isLoading || error) && (
        <div className="mt-4 rounded-lg border border-border bg-surface-elevated/50 px-4 py-3 text-sm text-text-secondary">
          {isLoading ? 'Loading schedule, forecast, and alerts...' : error}
        </div>
      )}

      <main className="mt-6">
        {activeTab === 'today' && (
          <div className="space-y-6">
            <SectionHeader title="Today's Plan" subtitle={`${formatDate(scheduleData.date)} · Europe/Athens operating day`} />
            <div className="rounded-lg border border-border bg-surface-elevated/50 p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xs uppercase tracking-wider text-text-secondary">Price Forecast</h2>
                <div className="flex gap-3 text-xs text-text-muted">
                  <span>P50 line</span>
                  <span>P10-P90 band</span>
                  <span>Charge/discharge overlays</span>
                </div>
              </div>
              <ForecastChart data={forecastData} chargeWindow={scheduleData.charge_window} dischargeWindow={scheduleData.discharge_window} />
            </div>
            <RecommendationCards schedule={scheduleData} />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="space-y-6">
                <ConstraintPanel constraints={scheduleData.physical_constraints} />
                <BatteryStressCard stress={scheduleData.battery_stress} />
              </div>
              <div className="space-y-6">
                <SoCFeasibilityCard feasibility={scheduleData.soc_feasibility} />
                <AlternativesPanel alternatives={scheduleData.alternatives} />
              </div>
            </div>
            <ExplanationPanel explanations={scheduleData.explanation} />
          </div>
        )}

        {activeTab === 'scenario' && (
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

        {activeTab === 'alerts' && (
          <div className="space-y-6">
            <SectionHeader title="Alerts" subtitle="Operational risks grouped by severity." />
            {(['critical', 'warning', 'info'] as const).map((severity) => (
              <div key={severity} className="space-y-3">
                <h3 className={`text-xs uppercase tracking-wider ${severity === 'critical' ? 'text-error' : severity === 'warning' ? 'text-warning' : 'text-info'}`}>
                  {severity}
                </h3>
                {groupedAlerts[severity].map((alert) => (
                  <AlertCard key={`${alert.severity}-${alert.title}`} alert={alert} />
                ))}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'backtest' && (
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
            />
          </div>
        )}
      </main>
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
