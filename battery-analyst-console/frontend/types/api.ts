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
export type ApiStatusKind = 'connected' | 'error' | 'loading'
export type OptimizerMode = 'milp'

export interface ApiStatus {
  kind: ApiStatusKind
  message: string
  detail?: string
  last_updated_at?: string
}

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
  profile_name?: string
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
  min_soc_reached: number
  max_soc_reached: number
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

export interface OptimizerMetadata {
  requested_mode: OptimizerMode | string
  used_mode: 'milp' | string
  fallback_used: boolean
  fallback_reason: string | null
  model_version: string
  is_optimal: boolean
  solver_status: string | null
  objective_value?: number | null
}

export interface DispatchDiagnostics {
  total_mwh_charged: number
  total_mwh_discharged: number
  equivalent_full_cycles: number
  auxiliary_load_mw: number
  auxiliary_energy_mwh: number
  simultaneous_action_violations: number
  max_grid_power_mw: number
  grid_connection_limit_mw: number
  grid_connection_limit_ok: boolean
  terminal_soc_error: number
  soc_min_violation_count: number
  soc_max_violation_count: number
  ramp_rate_violations: number
}

export interface ForecastProvenance {
  source: string
  weather_source: string
  weather_api_role: string
  price_model: string
  price_output: string
  price_unit: string
}

export interface PriceSpreadSummary {
  min_price_eur_per_mwh: number
  max_price_eur_per_mwh: number
  raw_spread_eur_per_mwh: number
  charge_avg_price_eur_per_mwh: number
  discharge_avg_price_eur_per_mwh: number
  spread_after_efficiency_eur_per_mwh: number
}

export interface PriceSpreadDiagnostics {
  mock_reference: PriceSpreadSummary
  live_forecast: PriceSpreadSummary
  value_math: string
}

export interface FleetEconomics {
  single_profile_expected_value_range_eur: number[]
  fleet_expected_value_range_eur: number[]
  active_battery_count: number
  total_fleet_power_mw: number
  total_fleet_capacity_mwh: number
  scaling_factor: number
  scaling_basis: string
  price_unit: string
  energy_unit: string
  value_formula: string
}

export interface AlternativeSchedule {
  label?: string
  charge_window: Window | null
  discharge_window: Window | null
  expected_value_range_eur?: number[]
  reason?: string
  spread_after_efficiency: number
  decision: Decision
  rejection_reasons: string[]
}

export interface ForecastPoint {
  timestamp: string
  predicted_price?: number
  lower_bound?: number
  upper_bound?: number
  confidence?: string
  shap_explanation?: ShapSlotExplanation | null
  p10_price: number
  p50_price: number
  p90_price: number
  actual_price: number | null
  action: 'charge' | 'discharge' | 'hold'
  soc: number
}

export interface ShapFeatureContribution {
  feature: string
  contribution_eur_per_mwh: number
  direction: 'up' | 'down' | string
}

export interface ShapSlotExplanation {
  source: string
  explanation_date: string
  confidence_score: number | null
  actual_price_eur_per_mwh: number | null
  model_price_eur_per_mwh: number | null
  top_contributions: ShapFeatureContribution[]
}

export interface ScheduleResponse {
  date: string
  decision: Decision
  confidence: Confidence
  optimizer?: OptimizerMetadata
  diagnostics?: DispatchDiagnostics
  single_profile_expected_value_range_eur?: number[]
  fleet_economics?: FleetEconomics | null
  forecast_provenance?: ForecastProvenance | null
  price_spread_diagnostics?: PriceSpreadDiagnostics | null
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
  optimizer_mode?: OptimizerMode
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

  // Legacy UI-only fields kept temporarily for older callers.
  battery_profile?: RiskAppetite
  battery_duration_hours?: number
  degradation_cost_eur_per_cycle?: number
}

export interface BacktestRequest {
  date: string
  profile_name: RiskAppetite | string
  optimizer_mode?: OptimizerMode
  lookback_days?: number
  forecast_method?: 'day_ahead_lightgbm' | string
  market_volatility?: MarketVolatility | string
  data_quality_level?: DataQualityLevel | string
  minimum_margin_eur_per_mwh?: number

  // Legacy UI-only field kept temporarily for older callers.
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
  curve: BacktestCurvePoint[]
  explanation: string[]
  warnings: string[]
  expected_value_eur?: number
  realized_value_eur?: number
  actual_spread?: number
  recommendation_quality?: 'excellent' | 'good' | 'fair' | 'poor'
  forecast_points?: ForecastPoint[]
}

export interface BacktestCurvePoint {
  timestamp: string
  forecast_price: number
  realized_price: number
  lower_bound: number | null
  upper_bound: number | null
}

export interface BacktestCoverage {
  source: string
  earliest_date: string | null
  latest_date: string | null
}

export type BacktestResult = BacktestResponse

// ---------------------------------------------------------------------------
// Backend request types
// ---------------------------------------------------------------------------

export interface BackendScheduleRequest {
  date: string
  profile_name?: RiskAppetite | string
  optimizer_mode?: OptimizerMode
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
  optimizer_mode?: OptimizerMode
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
  optimizer_mode?: OptimizerMode
  lookback_days?: number
  forecast_method?: 'day_ahead_lightgbm' | string
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
  confidence_score?: number
  arbitrage_signal?: number
  risk_adjusted_price?: number
  shap_explanation?: ShapSlotExplanation | null
}

export interface BackendForecastResponse {
  date: string
  market: string
  country: string
  unit: string
  points: BackendForecastPoint[]
  avg_band_width_eur: number
  provenance?: ForecastProvenance
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
  optimizer?: OptimizerMetadata
  diagnostics?: DispatchDiagnostics
  single_profile_expected_value_range_eur?: number[]
  fleet_economics?: FleetEconomics | null
  forecast_provenance?: ForecastProvenance | null
  price_spread_diagnostics?: PriceSpreadDiagnostics | null
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
  curve?: BacktestCurvePoint[]
  explanation: string[]
  warnings: string[]
}

// ---------------------------------------------------------------------------
// Legacy compatibility types
// ---------------------------------------------------------------------------

// The real backend /scenario endpoint now returns BackendScheduleResponse.
export type BackendScenarioResponse = BackendScheduleResponse
