/** All timestamps are ISO 8601 UTC. Amounts cover [start, end), the preceding hour. */
export interface RainForecastHour {
  start: string
  end: string
  rain: number | null
  probability: number | null
  precipitation: number | null
  snowfall: number | null
}

export interface RainForecastData {
  mode: 'online' | 'demo'
  source: string
  sourceUrl?: string
  hourly: RainForecastHour[]
  /** Fixed demonstration reference; online providers must omit this. */
  referenceTime?: string
}

export interface RainForecast extends RainForecastData {
  lon: number
  lat: number
  providerId: string
  fetchedAt: string
  range: { start: string; end: string } | null
}

/** Providers return mm for rain/total precipitation, cm for snowfall, and percent probability. */
export interface RainForecastProvider {
  id: string
  load(lon: number, lat: number, options: { signal: AbortSignal }): Promise<RainForecastData>
}

export interface RainForecastOptions {
  signal?: AbortSignal
  forceRefresh?: boolean
  provider?: RainForecastProvider
}

export interface RainForecastSummary {
  totalRain: number | null
  complete: boolean
  knownHours: number
  wetPeriods: Array<{ start: string; end: string }>
}
