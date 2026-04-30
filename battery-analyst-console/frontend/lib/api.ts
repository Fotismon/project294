import {
  Alert,
  AlternativeSchedule,
  BackendAlert,
  BackendAlternativeSchedule,
  BackendBacktestRequest,
  BackendBacktestResponse,
  BacktestCoverage,
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
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || ''
const EMPTY_VALUE_RANGE: [number, number] = [0, 0]
const PLACEHOLDER_WINDOW = {
  start: '00:00',
  end: '00:00',
  avg_price: 0
}

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

function requireApiBaseUrl(): void {
  if (!API_BASE_URL) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL is required. Configure it so the app can use live backend forecast data.')
  }
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

function profileName(value: RiskAppetite | string | undefined): RiskAppetite | string {
  return value || 'balanced'
}

function mapForecast(response: BackendForecastResponse): ForecastPoint[] {
  return response.points.map((point) => {
    return {
      timestamp: point.timestamp,
      p10_price: point.lower_bound,
      p50_price: point.predicted_price,
      p90_price: point.upper_bound,
      predicted_price: point.predicted_price,
      lower_bound: point.lower_bound,
      upper_bound: point.upper_bound,
      confidence: point.confidence,
      shap_explanation: point.shap_explanation ?? null,
      actual_price: null,
      action: 'hold',
      soc: 0.5
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
  const valueRange = rangeFrom(alt.expected_value_range_eur, EMPTY_VALUE_RANGE)

  return {
    label: alt.label,
    charge_window: alt.charge_window ?? PLACEHOLDER_WINDOW,
    discharge_window: alt.discharge_window ?? PLACEHOLDER_WINDOW,
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
    optimizer: response.optimizer,
    diagnostics: response.diagnostics,
    single_profile_expected_value_range_eur: response.single_profile_expected_value_range_eur,
    fleet_economics: response.fleet_economics,
    forecast_provenance: response.forecast_provenance,
    price_spread_diagnostics: response.price_spread_diagnostics,
    charge_window: response.charge_window,
    discharge_window: response.discharge_window,
    spread_after_efficiency: response.spread_after_efficiency,
    expected_value_range_eur: rangeFrom(response.expected_value_range_eur, EMPTY_VALUE_RANGE),
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
  optimizerMode: OptimizerMode = 'milp',
  forecastInput?: { prices: number[]; forecast_uncertainty_width: number; forecast_confidence: Confidence }
): BackendScheduleRequest {
  if (!forecastInput || forecastInput.prices.length !== 96) {
    throw new Error('Live forecast data must contain 96 price intervals before requesting a schedule.')
  }

  return {
    date,
    profile_name: profileName(batteryProfile),
    optimizer_mode: optimizerMode,
    prices: forecastInput.prices,
    temperatures: null,
    forecast_confidence: forecastInput.forecast_confidence,
    market_volatility: 'medium',
    forecast_uncertainty_width: forecastInput.forecast_uncertainty_width,
    data_quality_level: 'high',
    minimum_margin_eur_per_mwh: 2,
  }
}

function scenarioRequest(payload: ScenarioRequest): BackendScenarioRequest {
  const profile = profileName(payload.profile_name || payload.battery_profile || payload.risk_appetite)

  if (!payload.prices?.length || payload.prices.length !== 96) {
    throw new Error('Scenario requests require 96 live forecast price intervals.')
  }

  return {
    date: payload.date,
    profile_name: profile,
    optimizer_mode: payload.optimizer_mode ?? 'milp',
    prices: payload.prices,
    temperatures: payload.temperatures?.length ? payload.temperatures : null,
    round_trip_efficiency: normalizeEfficiency(payload.round_trip_efficiency),
    duration_hours: payload.duration_hours ?? payload.battery_duration_hours ?? null,
    max_cycles_per_day: payload.max_cycles_per_day ?? null,
    degradation_cost_eur_per_mwh: payload.degradation_cost_eur_per_mwh ?? payload.degradation_cost_eur_per_cycle ?? null,
    temperature_policy: normalizeTemperaturePolicy(payload.temperature_policy),
    risk_appetite: payload.risk_appetite,
    forecast_confidence: payload.forecast_confidence ?? 'medium',
    market_volatility: payload.market_volatility ?? 'medium',
    forecast_uncertainty_width: payload.forecast_uncertainty_width ?? null,
    data_quality_level: payload.data_quality_level ?? 'high',
    minimum_margin_eur_per_mwh: payload.minimum_margin_eur_per_mwh ?? 2
  }
}

function backtestRequest(payload: BacktestRequest): BackendBacktestRequest {
  return {
    date: payload.date,
    profile_name: payload.profile_name ?? payload.battery_profile ?? 'balanced',
    optimizer_mode: payload.optimizer_mode ?? 'milp',
    lookback_days: payload.lookback_days ?? 7,
    forecast_method: payload.forecast_method ?? 'day_ahead_lightgbm',
    market_volatility: payload.market_volatility ?? 'medium',
    data_quality_level: payload.data_quality_level ?? 'medium',
    minimum_margin_eur_per_mwh: payload.minimum_margin_eur_per_mwh ?? 2
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
    curve: response.curve ?? [],
    explanation: response.explanation ?? [],
    warnings: response.warnings ?? [],
    expected_value_eur: expectedMidpoint,
    realized_value_eur: Math.round(realized),
    actual_spread: economic?.realized_spread_after_efficiency ?? 0,
    recommendation_quality: deriveBacktestQuality(response.decision, realized, valueError),
    forecast_points: undefined
  }
}

export async function getForecast(date: string): Promise<ForecastPoint[]> {
  requireApiBaseUrl()

  try {
    return mapForecast(await fetchJson<BackendForecastResponse>(`/forecast?date=${date}`))
  } catch (error) {
    recordApiFallback('/forecast', error)
    throw error
  }
}

export async function getSchedule(date: string, batteryProfile?: RiskAppetite | string, optimizerMode: OptimizerMode = 'milp'): Promise<ScheduleResponse> {
  requireApiBaseUrl()

  try {
    const rawForecast = await fetchJson<BackendForecastResponse>(`/forecast?date=${date}`)
    const forecastInput = forecastToScheduleInputs(rawForecast)

    return mapSchedule(await fetchJson<BackendScheduleResponse>('/schedule', {
      method: 'POST',
      body: JSON.stringify(scheduleRequest(date, batteryProfile, optimizerMode, forecastInput))
    }))
  } catch (error) {
    recordApiFallback('/schedule', error)
    throw error
  }
}

export async function runScenario(payload: ScenarioRequest): Promise<ScheduleResponse> {
  requireApiBaseUrl()

  try {
    const scenario = await fetchJson<BackendScheduleResponse>('/scenario', {
      method: 'POST',
      body: JSON.stringify(scenarioRequest(payload))
    })
    return mapSchedule(scenario)
  } catch (error) {
    recordApiFallback('/scenario', error)
    throw error
  }
}

export async function runBacktest(payload: BacktestRequest): Promise<BacktestResponse> {
  requireApiBaseUrl()

  try {
    return mapBacktest(
      await fetchJson<BackendBacktestResponse>('/backtest', {
        method: 'POST',
        body: JSON.stringify(backtestRequest(payload))
      })
    )
  } catch (error) {
    recordApiFallback('/backtest', error)
    throw error
  }
}

export async function getBacktestCoverage(): Promise<BacktestCoverage> {
  requireApiBaseUrl()

  try {
    return await fetchJson<BacktestCoverage>('/backtest/coverage')
  } catch (error) {
    recordApiFallback('/backtest/coverage', error)
    throw error
  }
}

export async function getAlerts(): Promise<Alert[]> {
  // No dedicated /alerts endpoint exists yet.
  // Alerts are returned as part of /schedule and /scenario responses.
  return []
}

export async function getFleet(): Promise<FleetResponse> {
  requireApiBaseUrl()

  try {
    return await fetchJson<FleetResponse>('/fleet')
  } catch (error) {
    recordApiFallback('/fleet', error)
    throw error
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
