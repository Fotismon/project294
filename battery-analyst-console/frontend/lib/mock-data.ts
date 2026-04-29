import { Alert, BacktestResponse, BatteryAsset, ForecastPoint, ScheduleResponse } from '@/types/api'

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function expandForecastTo96Points(date = '2026-04-29'): ForecastPoint[] {
  const points: ForecastPoint[] = []

  for (let i = 0; i < 96; i++) {
    const hour = Math.floor(i / 4)
    const minute = (i % 4) * 15
    const timestamp = `${date}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`
    const minuteOffset = minute / 60
    let p10 = 0
    let p50 = 0
    let p90 = 0
    let action: ForecastPoint['action'] = 'hold'
    let soc = 0.5

    if (hour < 6) {
      p10 = 56 + Math.sin(i / 4) * 2
      p50 = 72 + Math.sin(i / 5) * 3
      p90 = 86 + Math.sin(i / 6) * 4
    } else if (hour < 10) {
      p10 = 46 + (hour - 6 + minuteOffset) * 5
      p50 = 58 + (hour - 6 + minuteOffset) * 7
      p90 = 74 + (hour - 6 + minuteOffset) * 9
    } else if (hour < 13) {
      const distanceFromNoon = Math.abs(12 - (hour + minuteOffset))
      p10 = 27 + distanceFromNoon * 2.2
      p50 = hour === 11 && minute === 0 ? 38.4 : 35 + distanceFromNoon * 2.8
      p90 = 45 + distanceFromNoon * 3.6
      action = hour >= 11 ? 'charge' : 'hold'
      soc = 0.5 + (((hour - 10) * 4 + minute / 15) / 12) * 0.32
    } else if (hour < 17) {
      p10 = 42 + (hour - 13 + minuteOffset) * 8
      p50 = 56 + (hour - 13 + minuteOffset) * 11
      p90 = 76 + (hour - 13 + minuteOffset) * 14
      soc = 0.82 - (((hour - 13) * 4 + minute / 15) / 16) * 0.08
    } else if (hour < 21) {
      p10 = hour === 20 && minute === 0 ? 92.1 : 78 + (hour - 17 + minuteOffset) * 8
      p50 = hour === 20 && minute === 0 ? 116.8 : 96 + (hour - 17 + minuteOffset) * 10
      p90 = hour === 20 && minute === 0 ? 141 : 124 + (hour - 17 + minuteOffset) * 13
      action = hour >= 20 ? 'discharge' : 'hold'
      soc = 0.74 - (((hour - 17) * 4 + minute / 15) / 16) * 0.25
    } else {
      p10 = 57 + Math.max(0, 23 - hour) * 2
      p50 = 73 + Math.max(0, 23 - hour) * 3
      p90 = 91 + Math.max(0, 23 - hour) * 4
      soc = 0.49
    }

    points.push({
      timestamp,
      p10_price: round1(p10),
      p50_price: round1(p50),
      p90_price: round1(p90),
      actual_price: null,
      action,
      soc: round1(soc * 100) / 100
    })
  }

  return points
}

export const mockScheduleResponse: ScheduleResponse = {
  date: '2026-04-29',
  decision: 'execute_with_caution',
  confidence: 'medium_high',
  charge_window: {
    start: '11:00',
    end: '13:00',
    avg_price: 38.4
  },
  discharge_window: {
    start: '20:00',
    end: '22:00',
    avg_price: 116.8
  },
  spread_after_efficiency: 71.6,
  expected_value_range_eur: [120, 180],
  soc_feasibility: {
    feasible: true,
    start_soc: 0.5,
    end_soc: 0.49,
    min_soc_reached: 0.28,
    max_soc_reached: 0.82,
    violations: []
  },
  battery_stress: {
    level: 'medium',
    score: 42,
    reasons: [
      'One cycle only',
      'Temperature risk during discharge window',
      'No rapid switching'
    ]
  },
  physical_constraints: {
    duration_ok: true,
    cycle_limit_ok: true,
    temperature_ok: false,
    soc_feasible: true,
    round_trip_efficiency_applied: true,
    rapid_switching_avoided: true
  },
  alternatives: [
    {
      charge_window: {
        start: '10:00',
        end: '12:00',
        avg_price: 42.1
      },
      discharge_window: {
        start: '19:00',
        end: '21:00',
        avg_price: 108.6
      },
      spread_after_efficiency: 61.8,
      decision: 'watch',
      rejection_reasons: [
        'Lower spread after efficiency',
        'Higher uncertainty during evening peak'
      ]
    }
  ],
  alerts: [
    {
      severity: 'warning',
      title: 'Temperature risk',
      message: 'Ambient temperature is elevated during the discharge window.',
      recommended_action: 'Review cooling assumptions or use conservative mode.'
    }
  ],
  explanation: [
    'Midday prices are expected to be low because of PV production.',
    'Evening prices rise as solar output drops and net load increases.',
    'The spread remains attractive after round-trip efficiency.',
    'Battery stress is acceptable but temperature risk is moderate.'
  ]
}

export const mockForecastData: ForecastPoint[] = expandForecastTo96Points()

export const mockFleetAssets: BatteryAsset[] = [
  {
    id: 'ath-01',
    name: 'Athens Battery 01',
    site: 'Athens North',
    status: 'available',
    capacity_mwh: 300,
    power_mw: 100,
    soc: 0.52,
    temperature_c: 31,
    auto_action: 'charge',
    selected_action: 'auto',
    expected_value_eur: [24, 36],
    stress_level: 'medium',
    constraint_warnings: ['Warm ambient conditions during evening discharge']
  },
  {
    id: 'ath-02',
    name: 'Athens Battery 02',
    site: 'Athens South',
    status: 'available',
    capacity_mwh: 240,
    power_mw: 80,
    soc: 0.46,
    temperature_c: 29,
    auto_action: 'charge',
    selected_action: 'auto',
    expected_value_eur: [18, 28],
    stress_level: 'low',
    constraint_warnings: []
  },
  {
    id: 'the-01',
    name: 'Thessaloniki Battery 01',
    site: 'Thessaloniki Hub',
    status: 'limited',
    capacity_mwh: 180,
    power_mw: 60,
    soc: 0.78,
    temperature_c: 34,
    auto_action: 'idle',
    selected_action: 'auto',
    expected_value_eur: [4, 9],
    stress_level: 'high',
    constraint_warnings: ['Temperature risk', 'Limited inverter availability']
  },
  {
    id: 'cre-01',
    name: 'Crete Battery 01',
    site: 'Heraklion',
    status: 'available',
    capacity_mwh: 220,
    power_mw: 70,
    soc: 0.81,
    temperature_c: 33,
    auto_action: 'discharge',
    selected_action: 'auto',
    expected_value_eur: [22, 34],
    stress_level: 'medium',
    constraint_warnings: ['High SoC asset prioritized for evening discharge']
  },
  {
    id: 'pat-01',
    name: 'Patras Battery 01',
    site: 'Patras West',
    status: 'available',
    capacity_mwh: 150,
    power_mw: 50,
    soc: 0.37,
    temperature_c: 27,
    auto_action: 'charge',
    selected_action: 'auto',
    expected_value_eur: [12, 20],
    stress_level: 'low',
    constraint_warnings: []
  },
  {
    id: 'vol-01',
    name: 'Volos Battery 01',
    site: 'Volos Port',
    status: 'offline',
    capacity_mwh: 120,
    power_mw: 40,
    soc: 0.22,
    temperature_c: 26,
    auto_action: 'idle',
    selected_action: 'auto',
    expected_value_eur: [0, 0],
    stress_level: 'low',
    constraint_warnings: ['Offline for maintenance']
  },
  {
    id: 'lar-01',
    name: 'Larissa Battery 01',
    site: 'Larissa Grid Node',
    status: 'available',
    capacity_mwh: 260,
    power_mw: 90,
    soc: 0.68,
    temperature_c: 32,
    auto_action: 'discharge',
    selected_action: 'auto',
    expected_value_eur: [26, 39],
    stress_level: 'medium',
    constraint_warnings: []
  },
  {
    id: 'ioa-01',
    name: 'Ioannina Battery 01',
    site: 'Ioannina Storage',
    status: 'limited',
    capacity_mwh: 160,
    power_mw: 55,
    soc: 0.18,
    temperature_c: 24,
    auto_action: 'charge',
    selected_action: 'auto',
    expected_value_eur: [8, 15],
    stress_level: 'medium',
    constraint_warnings: ['Low SoC asset cannot discharge safely']
  }
]

export const mockBacktestForecastData: ForecastPoint[] = expandForecastTo96Points('2026-04-25').map((point, index) => ({
  ...point,
  actual_price: round1(point.p50_price + Math.sin(index / 5) * 6 - (point.action === 'discharge' ? 4 : 0))
}))

export const mockAlerts: Alert[] = [
  ...mockScheduleResponse.alerts,
  {
    severity: 'critical',
    title: 'No-go day',
    message: 'Spread after efficiency is below minimum threshold. No profitable charge/discharge windows identified.',
    recommended_action: 'Hold battery at current SoC. Review tomorrow forecast for better opportunity.'
  },
  {
    severity: 'warning',
    title: 'High forecast uncertainty',
    message: 'P10-P90 spread exceeds €50/MWh for charge window. Forecast confidence is reduced.',
    recommended_action: 'Consider conservative assumptions or wait for an updated forecast.'
  },
  {
    severity: 'warning',
    title: 'Weak spread',
    message: 'Spread after round-trip efficiency is below €50/MWh threshold.',
    recommended_action: 'Consider alternative charge/discharge windows or hold.'
  },
  {
    severity: 'info',
    title: 'Physical constraint warning',
    message: 'Temperature constraint may be violated during peak discharge period.',
    recommended_action: 'Monitor battery temperature closely during discharge window.'
  },
  {
    severity: 'info',
    title: 'Data quality warning',
    message: 'Some forecast data points have elevated uncertainty.',
    recommended_action: 'Use median P50 prices for planning and review confidence levels.'
  },
  {
    severity: 'critical',
    title: 'Battery offline',
    message: 'Volos Battery 01 is offline for maintenance and excluded from dispatch.',
    recommended_action: 'Keep asset idle and verify maintenance window.'
  },
  {
    severity: 'warning',
    title: 'High temperature battery',
    message: 'Thessaloniki Battery 01 is operating near the high-temperature caution band.',
    recommended_action: 'Prefer idle or conservative dispatch until temperature normalizes.'
  },
  {
    severity: 'warning',
    title: 'Manual override conflicts with forecast',
    message: 'One or more manual actions may oppose the current market-driven recommendation.',
    recommended_action: 'Review override rationale before final dispatch.'
  },
  {
    severity: 'warning',
    title: 'Too many batteries discharging',
    message: 'Fleet discharge concentration can increase grid and battery stress.',
    recommended_action: 'Stagger discharge actions or return selected assets to auto mode.'
  },
  {
    severity: 'info',
    title: 'Low SoC asset cannot discharge',
    message: 'Ioannina Battery 01 is below the preferred SoC threshold for discharge.',
    recommended_action: 'Keep charging or idle until SoC recovers.'
  },
  {
    severity: 'warning',
    title: 'High stress asset should remain idle',
    message: 'Thessaloniki Battery 01 has high stress and limited availability.',
    recommended_action: 'Avoid manual discharge unless the market signal is exceptional.'
  }
]

export const mockBacktestResult: BacktestResponse = {
  date: '2026-04-25',
  decision: 'execute',
  charge_window: {
    start: '11:00',
    end: '13:00',
    avg_price: 35.2
  },
  discharge_window: {
    start: '19:00',
    end: '21:00',
    avg_price: 112.4
  },
  expected_value_eur: 150,
  realized_value_eur: 142,
  actual_spread: 70.2,
  recommendation_quality: 'good',
  explanation: 'Recommendation was sound. Actual spread was close to forecast. Temperature constraints were respected. Minor deviation came from evening peak volatility.',
  forecast_points: mockBacktestForecastData
}

export function getScenarioModifiedResponse(
  roundTripEfficiency: number,
  batteryDuration: number,
  maxCycles: number,
  riskAppetite: 'conservative' | 'balanced' | 'aggressive',
  temperaturePolicy: 'permissive' | 'balanced' | 'conservative',
  degradationCost = 10
): ScheduleResponse {
  const modified: ScheduleResponse = {
    ...mockScheduleResponse,
    soc_feasibility: { ...mockScheduleResponse.soc_feasibility },
    battery_stress: {
      ...mockScheduleResponse.battery_stress,
      reasons: [...mockScheduleResponse.battery_stress.reasons]
    },
    physical_constraints: { ...mockScheduleResponse.physical_constraints },
    alternatives: [...mockScheduleResponse.alternatives],
    alerts: [...mockScheduleResponse.alerts],
    explanation: [...mockScheduleResponse.explanation]
  }

  const efficiencyFactor = roundTripEfficiency / 90
  const durationFactor = batteryDuration < 2 ? 0.72 : batteryDuration > 2 ? 1.08 : 1
  const degradationFactor = Math.max(0.55, 1 - degradationCost / 180)
  const valueFactor = efficiencyFactor * durationFactor * degradationFactor

  modified.spread_after_efficiency = round1(mockScheduleResponse.spread_after_efficiency * efficiencyFactor)
  modified.expected_value_range_eur = [
    Math.round(mockScheduleResponse.expected_value_range_eur[0] * valueFactor),
    Math.round(mockScheduleResponse.expected_value_range_eur[1] * valueFactor)
  ]

  if (roundTripEfficiency < 80) {
    modified.decision = roundTripEfficiency < 75 ? 'hold' : 'watch'
    modified.confidence = 'medium'
    modified.alerts.push({
      severity: 'warning',
      title: 'Low efficiency impact',
      message: `Round-trip efficiency of ${roundTripEfficiency}% reduces potential value.`,
      recommended_action: 'Use a conservative threshold or wait for a wider spread.'
    })
    modified.explanation = [
      'Lower round-trip efficiency compresses the usable spread after losses.',
      'The midday-to-evening shape is still visible, but the value cushion is thinner.',
      'A more conservative decision is recommended until market or operating assumptions improve.'
    ]
  }

  if (riskAppetite === 'conservative') {
    modified.decision = modified.decision === 'execute' ? 'execute_with_caution' : modified.decision
    modified.confidence = modified.confidence === 'high' ? 'medium_high' : modified.confidence
  }

  if (riskAppetite === 'aggressive' && roundTripEfficiency >= 80) {
    modified.expected_value_range_eur = [
      Math.round(modified.expected_value_range_eur[0] * 1.08),
      Math.round(modified.expected_value_range_eur[1] * 1.12)
    ]
  }

  if (temperaturePolicy === 'conservative') {
    modified.physical_constraints.temperature_ok = false
    modified.battery_stress.level = 'high'
    modified.battery_stress.score = Math.min(80, modified.battery_stress.score + 20)
    modified.battery_stress.reasons.push('Conservative temperature policy active')
    modified.alerts.push({
      severity: 'warning',
      title: 'Temperature policy binding',
      message: 'Conservative temperature policy marks the discharge window as operationally risky.',
      recommended_action: 'Use the lower end of the value range or delay execution.'
    })
  }

  if (temperaturePolicy === 'permissive') {
    modified.physical_constraints.temperature_ok = true
    modified.battery_stress.level = 'low'
    modified.battery_stress.score = Math.max(20, modified.battery_stress.score - 15)
  }

  modified.physical_constraints.cycle_limit_ok = maxCycles >= 1
  return modified
}
