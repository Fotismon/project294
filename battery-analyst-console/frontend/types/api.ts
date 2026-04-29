// Battery Analyst Console - API Types

// Decision types
export type Decision = 'execute' | 'execute_with_caution' | 'watch' | 'hold'
export type Confidence = 'high' | 'medium_high' | 'medium' | 'low'
export type Severity = 'critical' | 'warning' | 'info'
export type BatteryStressLevel = 'low' | 'medium' | 'high'
export type RiskAppetite = 'conservative' | 'balanced' | 'aggressive'
export type TemperaturePolicy = 'permissive' | 'balanced' | 'conservative'

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
