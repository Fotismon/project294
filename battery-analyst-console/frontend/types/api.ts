// Battery Analyst Console - API Types

// ---------------------------------------------------------------------------
// UI/domain types
// ---------------------------------------------------------------------------

export type Decision = 'execute' | 'execute_with_caution' | 'watch' | 'hold'
export type Confidence = 'high' | 'medium_high' | 'medium' | 'low'
export type Severity = 'critical' | 'warning' | 'info'
export type BatteryStressLevel = 'low' | 'medium' | 'high'
export type RiskAppetite = 'conservative' | 'balanced' | 'aggressive'
export type TemperaturePolicy = 'relaxed' | 'normal' | 'strict'
export type MarketVolatility = 'low' | 'medium' | 'high'
export type DataQualityLevel = 'low' | 'medium' | 'high'
export type BatteryAction = 'auto' | 'charge' | 'discharge' | 'idle'
export type EffectiveBatteryAction = Exclude<BatteryAction, 'auto'>
export type FleetForecastAction = EffectiveBatteryAction | 'mixed'

export interface BatteryProfile {
  battery_id: string
  capacity_kwh: number
  max_charge_kw: number
  max_discharge_kw: number
  min_soc: number
  max_soc: number
  current_soc: number
  round_trip_efficiency: number
  max_cycles_per_day: number
}

export interface BatteryAsset {
  id: string
  name: string
  site: string
  status: 'available' | 'limited' | 'offline'
  capacity_mwh: number
  power_mw: number
  soc: number
  temperature_c: number
  auto_action: EffectiveBatteryAction
  selected_action: BatteryAction
  expected_value_eur: [number, number]
  stress_level: BatteryStressLevel
  constraint_warnings: string[]
}

export interface FleetSummary {
  total_assets: number
  available_assets: number
  total_capacity_mwh: number
  total_power_mw: number
  average_soc: number
  forecast_driven_action: FleetForecastAction
  assets_charging: number
  assets_discharging: number
  assets_idle: number
  expected_value_eur: [number, number]
}

export interface FleetRecommendation {
  summary: FleetSummary
  manual_override_count: number
  override_value_delta_eur: [number, number]
  warnings: string[]
}

export interface FleetResponse {
  assets: BatteryAsset[]
  summary: FleetSummary
}

export interface FleetRecommendationRequest {
  date: string
  assets: BatteryAsset[]
}

export interface PatchBatteryActionRequest {
  action: BatteryAction
}

export interface FleetBulkActionRequest {
  asset_ids: string[]
  action: BatteryAction
}

export interface Window {
  start: string
  end: string
  avg_price: number
}

export interface SoCFeasibility {
  feasible: boolean
  min_soc: number
  max_soc: number
  start_soc: number
  end_soc: number
  violations: string[]
  min_soc_reached?: number
  max_soc_reached?: number
}

export interface BatteryStress {
  level: BatteryStressLevel
  score: number
  reasons: string[]
}

export interface PhysicalConstraints {
  duration_ok: boolean
  cycle_limit_ok: boolean
  temperature_ok: boolean
  round_trip_efficiency_applied: boolean
  rapid_switching_avoided: boolean
  soc_feasible?: boolean
}

export interface Alert {
  severity: Severity
  title: string
  message: string
  recommended_action: string
}

export interface AlternativeSchedule {
  label?: string
  charge_window: Window
  discharge_window: Window
  expected_value_range_eur?: number[]
  reason?: string
  spread_after_efficiency?: number
  decision?: Decision
  rejection_reasons?: string[]
}

export interface ForecastPoint {
  timestamp: string
  predicted_price?: number
  lower_bound?: number
  upper_bound?: number
  confidence?: string
  p10_price?: number
  p50_price?: number
  p90_price?: number
  actual_price?: number | null
  action?: 'charge' | 'discharge' | 'hold'
  soc?: number
}

export interface ScheduleResponse {
  date: string
  decision: Decision
  confidence: Confidence
  charge_window: Window
  discharge_window: Window
  spread_after_efficiency: number
  expected_value_range_eur: [number, number]
  soc_feasibility: SoCFeasibility
  battery_stress: BatteryStress
  physical_constraints: PhysicalConstraints
  alternatives: AlternativeSchedule[]
  alerts: Alert[]
  explanation: string[]
}

export interface ScenarioRequest {
  date: string
  profile_name: RiskAppetite | string
  prices: number[]
  temperatures?: number[] | null
  round_trip_efficiency?: number | null
  duration_hours?: number | null
  max_cycles_per_day?: number | null
  degradation_cost_eur_per_mwh?: number | null
  temperature_policy: TemperaturePolicy
  risk_appetite: RiskAppetite
  forecast_confidence?: Confidence | string
  market_volatility?: MarketVolatility | string
  forecast_uncertainty_width?: number | null
  data_quality_level?: DataQualityLevel | string
  minimum_margin_eur_per_mwh?: number

  // Legacy UI-only fields kept temporarily until frontend/lib/api.ts is updated.
  battery_profile?: RiskAppetite
  battery_duration_hours?: number
  degradation_cost_eur_per_cycle?: number
}

export interface BacktestRequest {
  date: string
  profile_name: RiskAppetite | string
  lookback_days?: number
  forecast_method?: 'lookback_average' | string
  market_volatility?: MarketVolatility | string
  data_quality_level?: DataQualityLevel | string
  minimum_margin_eur_per_mwh?: number

  // Legacy UI-only field kept temporarily until frontend/lib/api.ts is updated.
  battery_profile?: RiskAppetite
}

export interface BacktestResponse {
  date: string
  profile_name: string
  forecast_method: string
  decision: Decision
  confidence: Confidence
  charge_window: BackendBacktestRealizedWindow | null
  discharge_window: BackendBacktestRealizedWindow | null
  economic_result: BackendBacktestEconomicResult | null
  schedule_response: ScheduleResponse | null
  explanation: string[]
  warnings: string[]
  expected_value_eur?: number
  realized_value_eur?: number
  actual_spread?: number
  recommendation_quality?: 'excellent' | 'good' | 'fair' | 'poor'
  forecast_points?: ForecastPoint[]
}

export type BacktestResult = BacktestResponse

// ---------------------------------------------------------------------------
// Backend request types
// ---------------------------------------------------------------------------

export interface BackendScheduleRequest {
  date: string
  profile_name?: RiskAppetite | string
  prices: number[]
  temperatures?: number[] | null
  forecast_confidence?: Confidence | string
  market_volatility?: MarketVolatility | string
  forecast_uncertainty_width?: number | null
  data_quality_level?: DataQualityLevel | string
  minimum_margin_eur_per_mwh?: number

  // Legacy fields are optional only, for backward compatibility.
  battery?: BatteryProfile
  strategy?: string
  market?: string
  country?: string
}

export interface BackendScenarioRequest {
  date: string
  profile_name?: RiskAppetite | string
  prices: number[]
  temperatures?: number[] | null
  round_trip_efficiency?: number | null
  duration_hours?: number | null
  max_cycles_per_day?: number | null
  degradation_cost_eur_per_mwh?: number | null
  temperature_policy?: TemperaturePolicy
  risk_appetite?: RiskAppetite
  forecast_confidence?: Confidence | string
  market_volatility?: MarketVolatility | string
  forecast_uncertainty_width?: number | null
  data_quality_level?: DataQualityLevel | string
  minimum_margin_eur_per_mwh?: number
}

export interface BackendBacktestRequest {
  date: string
  profile_name?: RiskAppetite | string
  lookback_days?: number
  forecast_method?: 'lookback_average' | string
  market_volatility?: MarketVolatility | string
  data_quality_level?: DataQualityLevel | string
  minimum_margin_eur_per_mwh?: number
}

// ---------------------------------------------------------------------------
// Backend response types
// ---------------------------------------------------------------------------

export interface BackendForecastPoint {
  timestamp: string
  predicted_price: number
  lower_bound: number
  upper_bound: number
  confidence: string
}

export interface BackendForecastResponse {
  date: string
  market: string
  country: string
  unit: string
  points: BackendForecastPoint[]
}

export interface BackendSoCFeasibility {
  feasible: boolean
  min_soc: number
  max_soc: number
  start_soc: number
  end_soc: number
  violations: string[]
}

export interface BackendPhysicalConstraints {
  duration_ok: boolean
  cycle_limit_ok: boolean
  temperature_ok: boolean
  round_trip_efficiency_applied: boolean
  rapid_switching_avoided: boolean
}

export interface BackendAlert {
  level: string
  message: string
  metric: string | null
}

export interface BackendAlternativeSchedule {
  label: string
  charge_window: Window | null
  discharge_window: Window | null
  expected_value_range_eur: number[]
  reason: string
}

export interface BackendScheduleResponse {
  date: string
  decision: string
  confidence: string
  charge_window: Window
  discharge_window: Window
  spread_after_efficiency: number
  expected_value_range_eur: number[]
  soc_feasibility: BackendSoCFeasibility
  battery_stress: BatteryStress
  physical_constraints: BackendPhysicalConstraints
  alternatives: BackendAlternativeSchedule[]
  alerts: BackendAlert[]
  explanation: string[]
}

export interface BackendBacktestRealizedWindow {
  start: string
  end: string
  forecast_avg_price: number
  realized_avg_price: number
}

export interface BackendBacktestEconomicResult {
  forecast_spread_after_efficiency: number
  realized_spread_after_efficiency: number
  forecast_expected_value_range_eur: number[]
  realized_value_eur: number
  value_error_eur: number
}

export interface BackendBacktestResponse {
  date: string
  profile_name: string
  forecast_method: string
  decision: string
  confidence: string
  charge_window: BackendBacktestRealizedWindow | null
  discharge_window: BackendBacktestRealizedWindow | null
  economic_result: BackendBacktestEconomicResult | null
  schedule_response: BackendScheduleResponse | null
  explanation: string[]
  warnings: string[]
}

// ---------------------------------------------------------------------------
// Legacy/mock compatibility types
// ---------------------------------------------------------------------------

// The real backend /scenario endpoint now returns BackendScheduleResponse.
export type BackendScenarioResponse = BackendScheduleResponse

