// Temporary MVP/demo scheduler inputs.
// The real forecast pipeline should eventually replace these generated series.

export const INTERVALS_PER_DAY = 96
export const INTERVAL_MINUTES = 15

export function timeToIntervalIndex(time: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(time)

  if (!match) {
    throw new Error(`Invalid time format: ${time}. Expected HH:MM.`)
  }

  const hours = Number(match[1])
  const minutes = Number(match[2])

  if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59) {
    throw new Error(`Invalid time value: ${time}.`)
  }

  if (hours === 24 && minutes !== 0) {
    throw new Error('24:00 is the only valid time in hour 24.')
  }

  const totalMinutes = hours * 60 + minutes

  if (totalMinutes % INTERVAL_MINUTES !== 0) {
    throw new Error(`Time must align to ${INTERVAL_MINUTES}-minute intervals: ${time}.`)
  }

  return totalMinutes / INTERVAL_MINUTES
}

export function buildConstantSeries(value: number, length = INTERVALS_PER_DAY): number[] {
  return Array.from({ length }, () => value)
}

export function applyWindowValue(
  series: number[],
  start: string,
  end: string,
  value: number
): number[] {
  const startIndex = timeToIntervalIndex(start)
  const endIndex = timeToIntervalIndex(end)

  if (startIndex >= endIndex) {
    throw new Error(`Window start must be before end: ${start}-${end}.`)
  }

  if (startIndex < 0 || endIndex > INTERVALS_PER_DAY) {
    throw new Error(`Window must stay within 00:00-24:00: ${start}-${end}.`)
  }

  return series.map((currentValue, index) => (
    index >= startIndex && index < endIndex ? value : currentValue
  ))
}

export function buildSamplePrices(): number[] {
  const basePrices = buildConstantSeries(80)
  const withChargeWindow = applyWindowValue(basePrices, '11:00', '13:00', 35)
  return applyWindowValue(withChargeWindow, '20:00', '22:00', 120)
}

export function buildSampleTemperatures(): number[] {
  const baseTemperatures = buildConstantSeries(25)
  return applyWindowValue(baseTemperatures, '20:00', '22:00', 31)
}

export function buildDefaultSchedulerInput() {
  return {
    prices: buildSamplePrices(),
    temperatures: buildSampleTemperatures(),
    forecast_confidence: 'medium_high' as const,
    market_volatility: 'medium' as const,
    forecast_uncertainty_width: 25,
    data_quality_level: 'medium' as const,
    minimum_margin_eur_per_mwh: 2
  }
}

export function buildFlatNoGoPrices(): number[] {
  return buildConstantSeries(80)
}

export function buildNormalTemperatures(): number[] {
  return buildConstantSeries(25)
}
