// Battery Analyst Console - API Client

import { ScheduleResponse, ForecastPoint, ScenarioRequest, BacktestRequest, BacktestResponse } from '@/types/api'
import { 
  mockScheduleResponse, 
  mockForecastData, 
  mockAlerts, 
  mockBacktestResult,
  getScenarioModifiedResponse 
} from './mock-data'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || ''

// Fetch forecast data
export async function getForecast(date: string): Promise<ForecastPoint[]> {
  if (!API_BASE_URL) {
    console.log('Using mock forecast data')
    return mockForecastData
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/forecast?date=${date}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    })
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    
    return await response.json()
  } catch (error) {
    console.warn('API unavailable, falling back to mock data:', error)
    return mockForecastData
  }
}

// Fetch schedule response
export async function getSchedule(date: string, batteryProfile?: string): Promise<ScheduleResponse> {
  if (!API_BASE_URL) {
    console.log('Using mock schedule data')
    return mockScheduleResponse
  }
  
  try {
    const params = new URLSearchParams({ date })
    if (batteryProfile) {
      params.append('battery_profile', batteryProfile)
    }
    
    const response = await fetch(`${API_BASE_URL}/schedule?${params}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    })
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    
    return await response.json()
  } catch (error) {
    console.warn('API unavailable, falling back to mock data:', error)
    return mockScheduleResponse
  }
}

// Run scenario analysis
export async function runScenario(payload: ScenarioRequest): Promise<ScheduleResponse> {
  if (!API_BASE_URL) {
    console.log('Using mock scenario data')
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
    const response = await fetch(`${API_BASE_URL}/scenario`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    
    return await response.json()
  } catch (error) {
    console.warn('API unavailable, falling back to mock data:', error)
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

// Run backtest
export async function runBacktest(payload: BacktestRequest): Promise<BacktestResponse> {
  if (!API_BASE_URL) {
    console.log('Using mock backtest data')
    return mockBacktestResult
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    
    return await response.json()
  } catch (error) {
    console.warn('API unavailable, falling back to mock data:', error)
    return mockBacktestResult
  }
}

// Get alerts
export async function getAlerts(): Promise<import('@/types/api').Alert[]> {
  if (!API_BASE_URL) {
    console.log('Using mock alerts data')
    return mockAlerts
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/alerts`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    })
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    
    return await response.json()
  } catch (error) {
    console.warn('API unavailable, falling back to mock data:', error)
    return mockAlerts
  }
}

// Check if using mock data
export function isUsingMockData(): boolean {
  return !API_BASE_URL
}
