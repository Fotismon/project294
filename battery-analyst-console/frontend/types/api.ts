// Battery Analyst Console - API Types

// Decision types
export type Decision = 'execute' | 'execute_with_caution' | 'watch' | 'hold'
export type Confidence = 'high' | 'medium_high' | 'medium' | 'low'
export type Severity = 'critical' | 'warning' | 'info'
export type BatteryStressLevel = 'low' | 'medium' | 'high'
export type RiskAppetite = 'conservative' | 'balanced' | 'aggressive'
export type TemperaturePolicy = 'permissive' | 'balanced' | 'conservative'
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

// Time window
export interface Window {
  start: string
  end: string
  avg_price: number
}

// SoC feasibility
export interface SoCFeasibility {
  feasible: boolean
  start_soc: number
  end_soc: number
  min_soc_reached: number
  max_soc_reached: number
  violations: string[]
}

// Battery stress
export interface BatteryStress {
  level: BatteryStressLevel
  score: number
  reasons: string[]
}

// Physical constraints
export interface PhysicalConstraints {
  duration_ok: boolean
  cycle_limit_ok: boolean
  temperature_ok: boolean
  soc_feasible: boolean
  round_trip_efficiency_applied: boolean
  rapid_switching_avoided: boolean
}

// Alert
export interface Alert {
  severity: Severity
  title: string
  message: string
  recommended_action: string
}

// Alternative schedule
export interface AlternativeSchedule {
  charge_window: Window
  discharge_window: Window
  spread_after_efficiency: number
  decision: Decision
  rejection_reasons: string[]
}

// Forecast point
export interface ForecastPoint {
  timestamp: string
  p10_price: number
  p50_price: number
  p90_price: number
  actual_price: number | null
  action: 'charge' | 'discharge' | 'hold'
  soc: number
}

// Main schedule response
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

// Scenario request
export interface ScenarioRequest {
  date: string
  battery_profile: RiskAppetite
  round_trip_efficiency: number
  battery_duration_hours: number
  max_cycles_per_day: number
  degradation_cost_eur_per_cycle: number
  risk_appetite: RiskAppetite
  temperature_policy: TemperaturePolicy
}

// Backtest request
export interface BacktestRequest {
  date: string
  battery_profile: RiskAppetite
}

// Backtest response
export interface BacktestResponse {
  date: string
  decision: Decision
  charge_window: Window
  discharge_window: Window
  expected_value_eur: number
  realized_value_eur: number
  actual_spread: number
  recommendation_quality: 'excellent' | 'good' | 'fair' | 'poor'
  explanation: string
  forecast_points: ForecastPoint[]
}

export type BacktestResult = BacktestResponse

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

export interface BackendScheduleRequest {
  date: string
  battery: BatteryProfile
  strategy: 'spread_capture'
  market: 'day_ahead'
  country: 'GR'
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

export interface BackendScenarioRequest {
  date: string
  battery: BatteryProfile
  price_multiplier: number
  efficiency_override: number | null
  notes?: string
}

export interface BackendScenarioResponse {
  date: string
  scenario_name: string
  decision: string
  expected_value_range_eur: number[]
  key_changes: string[]
  explanation: string[]
}

export interface BackendBacktestRequest {
  start_date: string
  end_date: string
  battery: BatteryProfile
  strategy: 'spread_capture'
}

export interface BackendBacktestResponse {
  start_date: string
  end_date: string
  strategy: string
  summary: {
    total_days: number
    profitable_days: number
    skipped_days: number
    total_expected_value_eur: number
    average_daily_value_eur: number
  }
  notes: string[]
}
