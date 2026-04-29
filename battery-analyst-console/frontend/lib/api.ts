import {
  Alert,
  AlternativeSchedule,
  BackendAlert,
  BackendAlternativeSchedule,
  BackendBacktestRequest,
  BackendBacktestResponse,
  BackendForecastResponse,
  BackendScheduleRequest,
  BackendScheduleResponse,
  BackendScenarioRequest,
  BatteryAction,
  BatteryAsset,
  BacktestRequest,
  BacktestResponse,
  Confidence,
  Decision,
  ForecastPoint,
  FleetBulkActionRequest,
  FleetRecommendation,
  FleetRecommendationRequest,
  FleetResponse,
  FleetSummary,
  PatchBatteryActionRequest,
  RiskAppetite,
  ScenarioRequest,
  ScheduleResponse,
  Severity
} from '@/types/api'
import {
  getScenarioModifiedResponse,
  mockAlerts,
  mockBacktestResult,
  mockFleetAssets,
  mockForecastData,
  mockScheduleResponse
} from './mock-data'
import { buildDefaultSchedulerInput } from './sample-inputs'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || ''

function effectiveFleetAction(asset: BatteryAsset): Exclude<BatteryAction, 'auto'> {
  return asset.selected_action === 'auto' ? asset.auto_action : asset.selected_action
}

function mapFleetSummary(assets: BatteryAsset[]): FleetSummary {
  const actions = assets.map(effectiveFleetAction)
  const autoActions = Array.from(new Set(assets.filter((asset) => asset.status !== 'offline').map((asset) => asset.auto_action)))

  return {
    total_assets: assets.length,
    available_assets: assets.filter((asset) => asset.status !== 'offline').length,
    total_capacity_mwh: assets.reduce((sum, asset) => sum + asset.capacity_mwh, 0),
    total_power_mw: assets.reduce((sum, asset) => sum + asset.power_mw, 0),
    average_soc: assets.reduce((sum, asset) => sum + asset.soc, 0) / Math.max(assets.length, 1),
    forecast_driven_action: autoActions.length === 1 ? autoActions[0] : 'mixed',
    assets_charging: actions.filter((action) => action === 'charge').length,
    assets_discharging: actions.filter((action) => action === 'discharge').length,
    assets_idle: actions.filter((action) => action === 'idle').length,
    expected_value_eur: assets.reduce<[number, number]>((range, asset) => [range[0] + asset.expected_value_eur[0], range[1] + asset.expected_value_eur[1]], [0, 0])
  }
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers
    }
  })

  if (!response.ok) {
    throw new Error(`API error ${response.status} for ${path}`)
  }

  return response.json() as Promise<T>
}

function asDecision(value: string | undefined): Decision {
  if (value === 'execute' || value === 'execute_with_caution' || value === 'watch' || value === 'hold') {
    return value
  }
  return 'watch'
}

function asConfidence(value: string | undefined): Confidence {
  if (value === 'high' || value === 'medium_high' || value === 'medium' || value === 'low') {
    return value
  }
  return 'medium'
}

function asSeverity(value: string | undefined): Severity {
  if (value === 'critical' || value === 'warning' || value === 'info') {
    return value
  }
  if (value === 'error' || value === 'danger') return 'critical'
  return 'info'
}

function rangeFrom(values: number[] | undefined, fallback: [number, number]): [number, number] {
  if (!values?.length) return fallback
  if (values.length === 1) return [Math.round(values[0]), Math.round(values[0])]
  return [Math.round(values[0]), Math.round(values[1])]
}

function normalizeEfficiency(value: number | null | undefined): number | null {
  if (value == null) return null
  return value > 1 ? value / 100 : value
}

function normalizeTemperaturePolicy(value: string | undefined): 'relaxed' | 'normal' | 'strict' {
  if (value === 'relaxed' || value === 'normal' || value === 'strict') return value
  if (value === 'permissive') return 'relaxed'
  if (value === 'conservative') return 'strict'
  return 'normal'
}

function normalizeMockTemperaturePolicy(value: string | undefined): 'permissive' | 'balanced' | 'conservative' {
  if (value === 'relaxed' || value === 'permissive') return 'permissive'
  if (value === 'strict' || value === 'conservative') return 'conservative'
  return 'balanced'
}

function scenarioEfficiencyPercent(value: number | null | undefined): number {
  const normalized = normalizeEfficiency(value)
  return normalized == null ? 90 : normalized * 100
}

function profileName(value: RiskAppetite | string | undefined): RiskAppetite | string {
  return value || 'balanced'
}

function hourOf(timestamp: string): number {
  const parsed = new Date(timestamp)
  if (!Number.isNaN(parsed.getTime())) return parsed.getHours()
  const match = timestamp.match(/T(\d{2}):/)
  return match ? Number(match[1]) : 0
}

function mapForecast(response: BackendForecastResponse): ForecastPoint[] {
  return response.points.map((point) => {
    const hour = hourOf(point.timestamp)
    const action: ForecastPoint['action'] = hour >= 11 && hour < 13 ? 'charge' : hour >= 20 && hour < 22 ? 'discharge' : 'hold'

    return {
      timestamp: point.timestamp,
      p10_price: point.lower_bound,
      p50_price: point.predicted_price,
      p90_price: point.upper_bound,
      actual_price: null,
      action,
      soc: action === 'charge' ? 0.62 : action === 'discharge' ? 0.74 : 0.5
    }
  })
}

function mapBackendAlert(alert: BackendAlert): Alert {
  return {
    severity: asSeverity(alert.level),
    title: alert.metric ? alert.metric.replace(/_/g, ' ') : `${alert.level || 'info'} alert`,
    message: alert.message,
    recommended_action: alert.level === 'warning' ? 'Review assumptions before execution.' : 'Monitor this signal.'
  }
}

function mapAlternative(alt: BackendAlternativeSchedule, fallbackDecision: Decision): AlternativeSchedule {
  const valueRange = rangeFrom(alt.expected_value_range_eur, mockScheduleResponse.expected_value_range_eur)

  return {
    charge_window: alt.charge_window ?? mockScheduleResponse.charge_window,
    discharge_window: alt.discharge_window ?? mockScheduleResponse.discharge_window,
    spread_after_efficiency: Math.max(0, valueRange[1] - valueRange[0]),
    decision: fallbackDecision === 'execute' ? 'execute_with_caution' : 'watch',
    rejection_reasons: [alt.label, alt.reason].filter(Boolean)
  }
}

function mapSchedule(response: BackendScheduleResponse): ScheduleResponse {
  const decision = asDecision(response.decision)

  return {
    date: response.date,
    decision,
    confidence: asConfidence(response.confidence),
    charge_window: response.charge_window,
    discharge_window: response.discharge_window,
    spread_after_efficiency: response.spread_after_efficiency,
    expected_value_range_eur: rangeFrom(response.expected_value_range_eur, mockScheduleResponse.expected_value_range_eur),
    soc_feasibility: {
      feasible: response.soc_feasibility.feasible,
      min_soc: response.soc_feasibility.min_soc,
      max_soc: response.soc_feasibility.max_soc,
      start_soc: response.soc_feasibility.start_soc,
      end_soc: response.soc_feasibility.end_soc,
      min_soc_reached: response.soc_feasibility.min_soc,
      max_soc_reached: response.soc_feasibility.max_soc,
      violations: response.soc_feasibility.violations ?? []
    },
    battery_stress: {
      level: response.battery_stress.level === 'low' || response.battery_stress.level === 'medium' || response.battery_stress.level === 'high'
        ? response.battery_stress.level
        : 'medium',
      score: response.battery_stress.score,
      reasons: response.battery_stress.reasons ?? []
    },
    physical_constraints: {
      duration_ok: response.physical_constraints.duration_ok,
      cycle_limit_ok: response.physical_constraints.cycle_limit_ok,
      temperature_ok: response.physical_constraints.temperature_ok,
      soc_feasible: response.soc_feasibility.feasible,
      round_trip_efficiency_applied: response.physical_constraints.round_trip_efficiency_applied,
      rapid_switching_avoided: response.physical_constraints.rapid_switching_avoided
    },
    alternatives: (response.alternatives ?? []).map((alternative) => mapAlternative(alternative, decision)),
    alerts: (response.alerts ?? []).map(mapBackendAlert),
    explanation: response.explanation ?? []
  }
}

function scheduleRequest(date: string, batteryProfile?: RiskAppetite | string): BackendScheduleRequest {
  const schedulerInput = buildDefaultSchedulerInput()

  return {
    date,
    profile_name: profileName(batteryProfile),
    ...schedulerInput
  }
}

function scenarioRequest(payload: ScenarioRequest): BackendScenarioRequest {
  const schedulerInput = buildDefaultSchedulerInput()
  const profile = profileName(payload.profile_name || payload.battery_profile || payload.risk_appetite)

  return {
    date: payload.date,
    profile_name: profile,
    prices: payload.prices?.length ? payload.prices : schedulerInput.prices,
    temperatures: payload.temperatures?.length ? payload.temperatures : schedulerInput.temperatures,
    round_trip_efficiency: normalizeEfficiency(payload.round_trip_efficiency),
    duration_hours: payload.duration_hours ?? payload.battery_duration_hours ?? null,
    max_cycles_per_day: payload.max_cycles_per_day ?? null,
    degradation_cost_eur_per_mwh: payload.degradation_cost_eur_per_mwh ?? payload.degradation_cost_eur_per_cycle ?? null,
    temperature_policy: normalizeTemperaturePolicy(payload.temperature_policy),
    risk_appetite: payload.risk_appetite,
    forecast_confidence: payload.forecast_confidence ?? schedulerInput.forecast_confidence,
    market_volatility: payload.market_volatility ?? schedulerInput.market_volatility,
    forecast_uncertainty_width: payload.forecast_uncertainty_width ?? schedulerInput.forecast_uncertainty_width,
    data_quality_level: payload.data_quality_level ?? schedulerInput.data_quality_level,
    minimum_margin_eur_per_mwh: payload.minimum_margin_eur_per_mwh ?? schedulerInput.minimum_margin_eur_per_mwh
  }
}

function backtestRequest(payload: BacktestRequest): BackendBacktestRequest {
  return {
    date: payload.date,
    profile_name: profileName(payload.profile_name || payload.battery_profile),
    lookback_days: payload.lookback_days ?? 7,
    forecast_method: payload.forecast_method ?? 'lookback_average',
    market_volatility: payload.market_volatility ?? 'medium',
    data_quality_level: payload.data_quality_level ?? 'medium',
    minimum_margin_eur_per_mwh: payload.minimum_margin_eur_per_mwh ?? 2
  }
}

function midpoint(values: number[] | undefined): number {
  if (!values?.length) return 0
  if (values.length === 1) return values[0]
  return (values[0] + values[1]) / 2
}

function recommendationQuality(response: BackendBacktestResponse): BacktestResponse['recommendation_quality'] {
  const realizedValue = response.economic_result?.realized_value_eur ?? 0
  const valueError = response.economic_result?.value_error_eur ?? 0
  const decision = asDecision(response.decision)

  if ((decision === 'execute' || decision === 'execute_with_caution') && realizedValue > 0 && valueError >= 0) return 'excellent'
  if ((decision === 'execute' || decision === 'execute_with_caution') && realizedValue > 0) return 'good'
  if (decision === 'hold') return 'fair'
  return 'fair'
}

function mapBacktest(response: BackendBacktestResponse): BacktestResponse {
  const expectedValue = midpoint(response.economic_result?.forecast_expected_value_range_eur)
  const realizedValue = response.economic_result?.realized_value_eur ?? 0

  return {
    date: response.date,
    profile_name: response.profile_name,
    forecast_method: response.forecast_method,
    decision: asDecision(response.decision),
    confidence: asConfidence(response.confidence),
    charge_window: response.charge_window,
    discharge_window: response.discharge_window,
    economic_result: response.economic_result,
    schedule_response: response.schedule_response ? mapSchedule(response.schedule_response) : null,
    explanation: response.explanation ?? [],
    warnings: response.warnings ?? [],
    expected_value_eur: Math.round(expectedValue),
    realized_value_eur: Math.round(realizedValue),
    actual_spread: response.economic_result?.realized_spread_after_efficiency ?? 0,
    recommendation_quality: recommendationQuality(response),
    forecast_points: mockBacktestResult.forecast_points
  }
}

export async function getForecast(date: string): Promise<ForecastPoint[]> {
  if (!API_BASE_URL) return mockForecastData

  try {
    return mapForecast(await fetchJson<BackendForecastResponse>('/forecast'))
  } catch (error) {
    console.warn('Forecast API unavailable, falling back to mock data:', error)
    return mockForecastData
  }
}

export async function getSchedule(date: string, batteryProfile?: RiskAppetite | string): Promise<ScheduleResponse> {
  if (!API_BASE_URL) return mockScheduleResponse

  try {
    return mapSchedule(await fetchJson<BackendScheduleResponse>('/schedule', {
      method: 'POST',
      body: JSON.stringify(scheduleRequest(date, batteryProfile))
    }))
  } catch (error) {
    console.warn('Schedule API unavailable, falling back to mock data:', error)
    return mockScheduleResponse
  }
}

export async function runScenario(payload: ScenarioRequest, baseline: ScheduleResponse = mockScheduleResponse): Promise<ScheduleResponse> {
  if (!API_BASE_URL) {
    return getScenarioModifiedResponse(
      scenarioEfficiencyPercent(payload.round_trip_efficiency),
      payload.duration_hours ?? payload.battery_duration_hours ?? 2,
      payload.max_cycles_per_day ?? 1,
      payload.risk_appetite,
      normalizeMockTemperaturePolicy(payload.temperature_policy),
      payload.degradation_cost_eur_per_mwh ?? payload.degradation_cost_eur_per_cycle ?? 10
    )
  }

  try {
    const scenario = await fetchJson<BackendScheduleResponse>('/scenario', {
      method: 'POST',
      body: JSON.stringify(scenarioRequest(payload))
    })
    return mapSchedule(scenario)
  } catch (error) {
    console.warn('Scenario API unavailable, falling back to mock data:', error)
    return getScenarioModifiedResponse(
      scenarioEfficiencyPercent(payload.round_trip_efficiency),
      payload.duration_hours ?? payload.battery_duration_hours ?? 2,
      payload.max_cycles_per_day ?? 1,
      payload.risk_appetite,
      normalizeMockTemperaturePolicy(payload.temperature_policy),
      payload.degradation_cost_eur_per_mwh ?? payload.degradation_cost_eur_per_cycle ?? 10
    )
  }
}

export async function runBacktest(payload: BacktestRequest): Promise<BacktestResponse> {
  if (!API_BASE_URL) return mockBacktestResult

  try {
    return mapBacktest(
      await fetchJson<BackendBacktestResponse>('/backtest', {
        method: 'POST',
        body: JSON.stringify(backtestRequest(payload))
      })
    )
  } catch (error) {
    console.warn('Backtest API unavailable, falling back to mock data:', error)
    return mockBacktestResult
  }
}

export async function getAlerts(): Promise<Alert[]> {
  // Dedicated /alerts endpoint does not exist yet; alerts arrive on schedule and scenario responses.
  return API_BASE_URL ? mockAlerts : mockAlerts
}

export async function getFleet(): Promise<FleetResponse> {
  if (!API_BASE_URL) {
    return { assets: mockFleetAssets, summary: mapFleetSummary(mockFleetAssets) }
  }

  try {
    return await fetchJson<FleetResponse>('/fleet')
  } catch (error) {
    console.warn('Fleet API unavailable, falling back to mock data:', error)
    return { assets: mockFleetAssets, summary: mapFleetSummary(mockFleetAssets) }
  }
}

export async function getFleetRecommendation(payload: FleetRecommendationRequest): Promise<FleetRecommendation> {
  const fallbackSummary = mapFleetSummary(payload.assets)

  if (!API_BASE_URL) {
    return {
      summary: fallbackSummary,
      manual_override_count: payload.assets.filter((asset) => asset.selected_action !== 'auto').length,
      override_value_delta_eur: [0, 0],
      warnings: []
    }
  }

  try {
    return await fetchJson<FleetRecommendation>('/fleet/recommendation', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  } catch (error) {
    console.warn('Fleet recommendation API unavailable, falling back to local summary:', error)
    return {
      summary: fallbackSummary,
      manual_override_count: payload.assets.filter((asset) => asset.selected_action !== 'auto').length,
      override_value_delta_eur: [0, 0],
      warnings: []
    }
  }
}

export async function patchFleetAssetAction(id: string, payload: PatchBatteryActionRequest): Promise<BatteryAsset | null> {
  if (!API_BASE_URL) return null

  try {
    return await fetchJson<BatteryAsset>(`/fleet/assets/${id}/action`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    })
  } catch (error) {
    console.warn('Fleet asset action API unavailable, keeping local override:', error)
    return null
  }
}

export async function runFleetBulkAction(payload: FleetBulkActionRequest): Promise<FleetResponse | null> {
  if (!API_BASE_URL) return null

  try {
    return await fetchJson<FleetResponse>('/fleet/bulk-action', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  } catch (error) {
    console.warn('Fleet bulk action API unavailable, keeping local overrides:', error)
    return null
  }
}

export function isUsingMockData(): boolean {
  return !API_BASE_URL
}
