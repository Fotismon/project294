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
  OptimizerMode,
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

interface ApiFallbackInfo {
  path: string
  message: string
  at: string
}

let lastApiFallback: ApiFallbackInfo | null = null

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function recordApiFallback(path: string, error: unknown): void {
  lastApiFallback = {
    path,
    message: readableError(error),
    at: new Date().toISOString()
  }
}

function compactApiDetail(payload: unknown): string {
  if (typeof payload === 'string') return payload
  if (!payload || typeof payload !== 'object') return ''

  const record = payload as Record<string, unknown>
  const detail = record.detail

  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return String(entry)
        const item = entry as Record<string, unknown>
        const location = Array.isArray(item.loc) ? item.loc.join('.') : ''
        const message = typeof item.msg === 'string' ? item.msg : JSON.stringify(item)
        return location ? `${location}: ${message}` : message
      })
      .join('; ')
  }

  const message = record.message
  if (typeof message === 'string') return message

  return JSON.stringify(payload)
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

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers
    }
  })

  if (!response.ok) {
    let detail = ''
    try {
      const contentType = response.headers.get('content-type') ?? ''
      detail = contentType.includes('application/json')
        ? compactApiDetail(await response.json())
        : await response.text()
    } catch {
      detail = ''
    }

    throw new Error(`API error ${response.status} for ${path}${detail ? `: ${detail}` : ''}`)
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
    label: alt.label,
    charge_window: alt.charge_window ?? mockScheduleResponse.charge_window,
    discharge_window: alt.discharge_window ?? mockScheduleResponse.discharge_window,
    expected_value_range_eur: alt.expected_value_range_eur,
    reason: alt.reason,
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
    optimizer: response.optimizer ?? mockScheduleResponse.optimizer,
    diagnostics: response.diagnostics ?? mockScheduleResponse.diagnostics,
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

function forecastToScheduleInputs(raw: BackendForecastResponse): {
  prices: number[]
  forecast_uncertainty_width: number
  forecast_confidence: Confidence
} {
  const prices = raw.points.map((p) => p.predicted_price)
  const counts: Record<string, number> = {}
  for (const pt of raw.points) counts[pt.confidence] = (counts[pt.confidence] ?? 0) + 1
  const topConfidence = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'medium'
  return {
    prices,
    forecast_uncertainty_width: raw.avg_band_width_eur,
    forecast_confidence: asConfidence(topConfidence),
  }
}

function scheduleRequest(
  date: string,
  batteryProfile?: RiskAppetite | string,
  optimizerMode: OptimizerMode = 'window_v1',
  forecastOverrides?: { prices: number[]; forecast_uncertainty_width: number; forecast_confidence: Confidence }
): BackendScheduleRequest {
  const schedulerInput = buildDefaultSchedulerInput()

  return {
    date,
    profile_name: profileName(batteryProfile),
    optimizer_mode: optimizerMode,
    prices: forecastOverrides?.prices ?? schedulerInput.prices,
    temperatures: schedulerInput.temperatures,
    forecast_confidence: forecastOverrides?.forecast_confidence ?? schedulerInput.forecast_confidence,
    market_volatility: schedulerInput.market_volatility,
    forecast_uncertainty_width: forecastOverrides?.forecast_uncertainty_width ?? schedulerInput.forecast_uncertainty_width,
    data_quality_level: schedulerInput.data_quality_level,
    minimum_margin_eur_per_mwh: schedulerInput.minimum_margin_eur_per_mwh,
  }
}

function scenarioRequest(payload: ScenarioRequest): BackendScenarioRequest {
  const schedulerInput = buildDefaultSchedulerInput()
  const profile = profileName(payload.profile_name || payload.battery_profile || payload.risk_appetite)

  return {
    date: payload.date,
    profile_name: profile,
    optimizer_mode: payload.optimizer_mode ?? 'window_v1',
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
    profile_name: payload.profile_name ?? payload.battery_profile ?? 'balanced',
    optimizer_mode: payload.optimizer_mode ?? 'window_v1',
    lookback_days: payload.lookback_days ?? 7,
    forecast_method: payload.forecast_method ?? 'lookback_average',
    market_volatility: payload.market_volatility ?? 'medium',
    data_quality_level: payload.data_quality_level ?? 'medium',
    minimum_margin_eur_per_mwh: payload.minimum_margin_eur_per_mwh ?? 2
  }
}

function withMockOptimizer(schedule: ScheduleResponse, optimizerMode: OptimizerMode = 'window_v1'): ScheduleResponse {
  if (optimizerMode === 'window_v1') {
    return {
      ...schedule,
      optimizer: mockScheduleResponse.optimizer,
      diagnostics: schedule.diagnostics ?? mockScheduleResponse.diagnostics
    }
  }

  return {
    ...schedule,
    optimizer: {
      requested_mode: optimizerMode,
      used_mode: 'window_v1',
      fallback_used: true,
      fallback_reason: 'Live optimizer unavailable in demo fallback; showing Window V1 sample data.',
      model_version: 'window_v1.2',
      is_optimal: false,
      solver_status: 'demo_fallback'
    },
    diagnostics: schedule.diagnostics ?? mockScheduleResponse.diagnostics
  }
}

function deriveBacktestQuality(
  decision: string,
  realizedValue: number,
  valueError: number
): 'excellent' | 'good' | 'fair' | 'poor' {
  if (decision === 'hold') return 'fair'
  if (realizedValue > 0 && Math.abs(valueError) < 500) return 'excellent'
  if (realizedValue > 0) return 'good'
  if (realizedValue === 0) return 'fair'
  return 'poor'
}

function mapBacktest(response: BackendBacktestResponse): BacktestResponse {
  const economic = response.economic_result
  const forecastRange = economic?.forecast_expected_value_range_eur ?? [0, 0]
  const expectedMidpoint = forecastRange.length >= 2
    ? Math.round((forecastRange[0] + forecastRange[1]) / 2)
    : 0
  const realized = economic?.realized_value_eur ?? 0
  const valueError = economic?.value_error_eur ?? 0

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
    expected_value_eur: expectedMidpoint,
    realized_value_eur: Math.round(realized),
    actual_spread: economic?.realized_spread_after_efficiency ?? 0,
    recommendation_quality: deriveBacktestQuality(response.decision, realized, valueError),
    forecast_points: mockBacktestResult.forecast_points
  }
}

export async function getForecast(date: string): Promise<ForecastPoint[]> {
  if (!API_BASE_URL) return mockForecastData

  try {
    return mapForecast(await fetchJson<BackendForecastResponse>(`/forecast?date=${date}`))
  } catch (error) {
    console.warn('Forecast API unavailable, using demo fallback data:', error)
    recordApiFallback('/forecast', error)
    return mockForecastData
  }
}

export async function getSchedule(date: string, batteryProfile?: RiskAppetite | string, optimizerMode: OptimizerMode = 'window_v1'): Promise<ScheduleResponse> {
  if (!API_BASE_URL) return withMockOptimizer(mockScheduleResponse, optimizerMode)

  try {
    // Fetch the real forecast first so the schedule uses model-predicted prices.
    let forecastOverrides: { prices: number[]; forecast_uncertainty_width: number; forecast_confidence: Confidence } | undefined
    try {
      const rawForecast = await fetchJson<BackendForecastResponse>(`/forecast?date=${date}`)
      forecastOverrides = forecastToScheduleInputs(rawForecast)
    } catch {
      // Forecast unavailable — schedule will fall back to sample prices.
    }

    return mapSchedule(await fetchJson<BackendScheduleResponse>('/schedule', {
      method: 'POST',
      body: JSON.stringify(scheduleRequest(date, batteryProfile, optimizerMode, forecastOverrides))
    }))
  } catch (error) {
    console.warn('Schedule API unavailable, using demo fallback data:', error)
    recordApiFallback('/schedule', error)
    return withMockOptimizer(mockScheduleResponse, optimizerMode)
  }
}

export async function runScenario(payload: ScenarioRequest, baseline: ScheduleResponse = mockScheduleResponse): Promise<ScheduleResponse> {
  if (!API_BASE_URL) {
    return withMockOptimizer(getScenarioModifiedResponse(
      scenarioEfficiencyPercent(payload.round_trip_efficiency),
      payload.duration_hours ?? payload.battery_duration_hours ?? 2,
      payload.max_cycles_per_day ?? 1,
      payload.risk_appetite,
      normalizeMockTemperaturePolicy(payload.temperature_policy),
      payload.degradation_cost_eur_per_mwh ?? payload.degradation_cost_eur_per_cycle ?? 10
    ), payload.optimizer_mode ?? 'window_v1')
  }

  try {
    const scenario = await fetchJson<BackendScheduleResponse>('/scenario', {
      method: 'POST',
      body: JSON.stringify(scenarioRequest(payload))
    })
    return mapSchedule(scenario)
  } catch (error) {
    console.warn('Scenario API unavailable, using demo fallback data:', error)
    recordApiFallback('/scenario', error)
    return withMockOptimizer(getScenarioModifiedResponse(
      scenarioEfficiencyPercent(payload.round_trip_efficiency),
      payload.duration_hours ?? payload.battery_duration_hours ?? 2,
      payload.max_cycles_per_day ?? 1,
      payload.risk_appetite,
      normalizeMockTemperaturePolicy(payload.temperature_policy),
      payload.degradation_cost_eur_per_mwh ?? payload.degradation_cost_eur_per_cycle ?? 10
    ), payload.optimizer_mode ?? 'window_v1')
  }
}

export async function runBacktest(payload: BacktestRequest): Promise<BacktestResponse> {
  if (!API_BASE_URL) {
    return {
      ...mockBacktestResult,
      schedule_response: mockBacktestResult.schedule_response
        ? withMockOptimizer(mockBacktestResult.schedule_response, payload.optimizer_mode ?? 'window_v1')
        : null
    }
  }

  try {
    return mapBacktest(
      await fetchJson<BackendBacktestResponse>('/backtest', {
        method: 'POST',
        body: JSON.stringify(backtestRequest(payload))
      })
    )
  } catch (error) {
    console.warn('Backtest API unavailable, using demo fallback data:', error)
    recordApiFallback('/backtest', error)
    return {
      ...mockBacktestResult,
      schedule_response: mockBacktestResult.schedule_response
        ? withMockOptimizer(mockBacktestResult.schedule_response, payload.optimizer_mode ?? 'window_v1')
        : null,
      warnings: ['Backtest data unavailable. Showing demo fallback result.', ...mockBacktestResult.warnings]
    }
  }
}

export async function getAlerts(): Promise<Alert[]> {
  // No dedicated /alerts endpoint exists yet.
  // Alerts are returned as part of /schedule and /scenario responses.
  return mockAlerts
}

export async function getFleet(): Promise<FleetResponse> {
  if (!API_BASE_URL) {
    return { assets: mockFleetAssets, summary: mapFleetSummary(mockFleetAssets) }
  }

  try {
    return await fetchJson<FleetResponse>('/fleet')
  } catch (error) {
    console.warn('Fleet API unavailable, using demo fallback data:', error)
    recordApiFallback('/fleet', error)
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
    recordApiFallback('/fleet/recommendation', error)
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
    recordApiFallback(`/fleet/assets/${id}/action`, error)
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
    recordApiFallback('/fleet/bulk-action', error)
    return null
  }
}

export function isUsingMockData(): boolean {
  return !API_BASE_URL
}

export function hasConfiguredApiBaseUrl(): boolean {
  return Boolean(API_BASE_URL)
}

export function clearApiFallback(): void {
  lastApiFallback = null
}

export function getLastApiFallback(): ApiFallbackInfo | null {
  return lastApiFallback
}
