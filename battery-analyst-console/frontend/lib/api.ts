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
  BackendScenarioResponse,
  BatteryAction,
  BatteryAsset,
  BatteryProfile,
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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || ''

const DEFAULT_BATTERY: BatteryProfile = {
  battery_id: 'battery-001',
  capacity_kwh: 1000,
  max_charge_kw: 500,
  max_discharge_kw: 500,
  min_soc: 0.1,
  max_soc: 0.9,
  current_soc: 0.5,
  round_trip_efficiency: 0.88,
  max_cycles_per_day: 1
}

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

function buildBatteryProfile(overrides: Partial<BatteryProfile> = {}): BatteryProfile {
  return { ...DEFAULT_BATTERY, ...overrides }
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

function scheduleRequest(date: string, overrides: Partial<BatteryProfile> = {}): BackendScheduleRequest {
  return {
    date,
    battery: buildBatteryProfile(overrides),
    strategy: 'spread_capture',
    market: 'day_ahead',
    country: 'GR'
  }
}

function scenarioRequest(payload: ScenarioRequest): BackendScenarioRequest {
  return {
    date: payload.date,
    battery: buildBatteryProfile({
      round_trip_efficiency: payload.round_trip_efficiency / 100,
      max_cycles_per_day: payload.max_cycles_per_day
    }),
    price_multiplier: payload.risk_appetite === 'aggressive' ? 1.12 : payload.risk_appetite === 'conservative' ? 0.92 : 1,
    efficiency_override: payload.round_trip_efficiency / 100,
    notes: `duration=${payload.battery_duration_hours}h; degradation=${payload.degradation_cost_eur_per_cycle}; temperature=${payload.temperature_policy}`
  }
}

function mergeScenarioIntoSchedule(response: BackendScenarioResponse, baseline: ScheduleResponse): ScheduleResponse {
  return {
    ...baseline,
    date: response.date,
    decision: asDecision(response.decision),
    expected_value_range_eur: rangeFrom(response.expected_value_range_eur, baseline.expected_value_range_eur),
    alerts: [
      ...baseline.alerts,
      {
        severity: 'info',
        title: response.scenario_name.replace(/_/g, ' '),
        message: response.key_changes.join(' '),
        recommended_action: 'Compare this scenario against the base schedule before dispatch.'
      }
    ],
    explanation: response.explanation.length > 0 ? response.explanation : baseline.explanation
  }
}

function backtestRequest(payload: BacktestRequest): BackendBacktestRequest {
  const endDate = payload.date
  const start = new Date(`${payload.date}T12:00:00`)
  start.setDate(start.getDate() - 29)

  return {
    start_date: start.toISOString().slice(0, 10),
    end_date: endDate,
    battery: buildBatteryProfile({
      max_cycles_per_day: payload.battery_profile === 'aggressive' ? 2 : 1,
      round_trip_efficiency: payload.battery_profile === 'conservative' ? 0.9 : 0.88
    }),
    strategy: 'spread_capture'
  }
}

function mapBacktest(response: BackendBacktestResponse, requestedDate: string): BacktestResponse {
  const total = Math.round(response.summary.total_expected_value_eur)
  const realized = Math.round(response.summary.average_daily_value_eur * response.summary.profitable_days)

  return {
    date: requestedDate,
    decision: response.summary.profitable_days > response.summary.skipped_days ? 'execute' : 'watch',
    charge_window: mockBacktestResult.charge_window,
    discharge_window: mockBacktestResult.discharge_window,
    expected_value_eur: total,
    realized_value_eur: realized,
    actual_spread: Math.round(response.summary.average_daily_value_eur * 10) / 10,
    recommendation_quality: response.summary.profitable_days / Math.max(response.summary.total_days, 1) > 0.65 ? 'good' : 'fair',
    explanation: response.notes.join(' '),
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
    const profileOverrides: Partial<BatteryProfile> = {
      max_cycles_per_day: batteryProfile === 'aggressive' ? 2 : 1,
      round_trip_efficiency: batteryProfile === 'conservative' ? 0.9 : 0.88
    }

    return mapSchedule(await fetchJson<BackendScheduleResponse>('/schedule', {
      method: 'POST',
      body: JSON.stringify(scheduleRequest(date, profileOverrides))
    }))
  } catch (error) {
    console.warn('Schedule API unavailable, falling back to mock data:', error)
    return mockScheduleResponse
  }
}

export async function runScenario(payload: ScenarioRequest, baseline: ScheduleResponse = mockScheduleResponse): Promise<ScheduleResponse> {
  if (!API_BASE_URL) {
    return getScenarioModifiedResponse(
      payload.round_trip_efficiency,
      payload.battery_duration_hours,
      payload.max_cycles_per_day,
      payload.risk_appetite,
      payload.temperature_policy,
      payload.degradation_cost_eur_per_cycle
    )
  }

  try {
    const scenario = await fetchJson<BackendScenarioResponse>('/scenario', {
      method: 'POST',
      body: JSON.stringify(scenarioRequest(payload))
    })
    return mergeScenarioIntoSchedule(scenario, baseline)
  } catch (error) {
    console.warn('Scenario API unavailable, falling back to mock data:', error)
    return getScenarioModifiedResponse(
      payload.round_trip_efficiency,
      payload.battery_duration_hours,
      payload.max_cycles_per_day,
      payload.risk_appetite,
      payload.temperature_policy,
      payload.degradation_cost_eur_per_cycle
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
      }),
      payload.date
    )
  } catch (error) {
    console.warn('Backtest API unavailable, falling back to mock data:', error)
    return mockBacktestResult
  }
}

export async function getAlerts(): Promise<Alert[]> {
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
