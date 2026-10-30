import { openMeteoRainProvider } from './openMeteo'
import type {
  RainForecast,
  RainForecastData,
  RainForecastOptions,
  RainForecastProvider,
  RainForecastSummary
} from './types'

const HOUR = 3600_000
const TTL = 10 * 60_000
interface Cached {
  data: RainForecastData
  fetchedAt: number
}
interface Pending {
  promise: Promise<Cached>
  controller: AbortController
  consumers: number
}

function abortError() {
  return new DOMException('已取消降雨预报', 'AbortError')
}

function validate(data: RainForecastData): RainForecastData {
  if (
    !data ||
    !['online', 'demo'].includes(data.mode) ||
    !data.source ||
    !Array.isArray(data.hourly)
  )
    throw new Error('降雨预报数据格式错误')
  if (data.mode === 'demo' && !Number.isFinite(Date.parse(data.referenceTime ?? '')))
    throw new Error('演示数据缺少固定参考时间')
  const hours = data.hourly
    .map((hour) => {
      const start = Date.parse(hour.start)
      const end = Date.parse(hour.end)
      if (!Number.isFinite(start) || !Number.isFinite(end) || end - start !== HOUR || end % HOUR)
        throw new Error('降雨预报必须使用完整小时区间')
      for (const key of ['rain', 'precipitation', 'snowfall', 'probability'] as const) {
        const value = hour[key]
        if (
          value !== null &&
          (typeof value !== 'number' ||
            !Number.isFinite(value) ||
            value < 0 ||
            (key === 'probability' && value > 100))
        )
          throw new Error(`降雨预报数值非法：${key}`)
      }
      return { ...hour, start: new Date(start).toISOString(), end: new Date(end).toISOString() }
    })
    .sort((a, b) => a.end.localeCompare(b.end))
  if (new Set(hours.map((hour) => hour.end)).size !== hours.length)
    throw new Error('降雨预报时刻重复')
  return { ...data, hourly: hours }
}

/** Bounded TTL cache, independent consumer cancellation, and a deadline including body parsing. */
export class RainForecastService {
  private cache = new Map<string, Cached>()
  private pending = new Map<string, Pending>()
  private latest = new Map<string, Pending>()
  private providers = new WeakMap<RainForecastProvider, number>()
  private providerSequence = 0

  getRainForecast(
    lon: number,
    lat: number,
    options: RainForecastOptions = {}
  ): Promise<RainForecast> {
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90)
      return Promise.reject(new Error('经纬度超出有效范围'))
    if (options.signal?.aborted) return Promise.reject(options.signal.reason ?? abortError())
    const provider = options.provider ?? openMeteoRainProvider
    if (!this.providers.has(provider)) this.providers.set(provider, ++this.providerSequence)
    const key = `${this.providers.get(provider)}:${lon.toFixed(5)}:${lat.toFixed(5)}`
    const now = Date.now()
    const cached = this.cache.get(key)
    if (!options.forceRefresh && cached && now - cached.fetchedAt < TTL) {
      this.cache.delete(key)
      this.cache.set(key, cached)
      return Promise.resolve(this.result(cached, lon, lat, provider.id, now))
    }
    this.cache.delete(key)
    const pendingKey = options.forceRefresh ? `${key}:refresh` : key
    let pending = this.pending.get(`${key}:refresh`) ?? this.pending.get(pendingKey)
    if (!pending) {
      const controller = new AbortController()
      pending = { controller, consumers: 0, promise: Promise.resolve(null as unknown as Cached) }
      const own = pending
      this.pending.set(pendingKey, own)
      this.latest.set(key, own)
      own.promise = this.load(provider, lon, lat, controller)
        .then((value) => {
          controller.signal.throwIfAborted()
          if (this.latest.get(key) === own) {
            this.cache.delete(key)
            this.cache.set(key, value)
            while (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value!)
          }
          return value
        })
        .finally(() => {
          if (this.pending.get(pendingKey) === own) this.pending.delete(pendingKey)
          if (this.latest.get(key) === own) this.latest.delete(key)
        })
    }
    const own = pending
    own.consumers++
    return new Promise((resolve, reject) => {
      let done = false
      const finish = () => {
        if (done) return false
        done = true
        options.signal?.removeEventListener('abort', abort)
        if (
          --own.consumers === 0 &&
          (this.pending.get(key) === own || this.pending.get(`${key}:refresh`) === own)
        ) {
          if (this.latest.get(key) === own) this.latest.delete(key)
          if (this.pending.get(key) === own) this.pending.delete(key)
          if (this.pending.get(`${key}:refresh`) === own) this.pending.delete(`${key}:refresh`)
          own.controller.abort(abortError())
        }
        return true
      }
      const abort = () => {
        if (finish()) reject(options.signal?.reason ?? abortError())
      }
      options.signal?.addEventListener('abort', abort, { once: true })
      own.promise.then(
        (value) => {
          if (finish()) resolve(this.result(value, lon, lat, provider.id, Date.now()))
        },
        (error) => {
          if (finish()) reject(error)
        }
      )
    })
  }

  private async load(
    provider: RainForecastProvider,
    lon: number,
    lat: number,
    controller: AbortController
  ): Promise<Cached> {
    const timer = setTimeout(
      () => controller.abort(new DOMException('预报请求超时，请重试', 'TimeoutError')),
      15_000
    )
    let onAbort: () => void = () => undefined
    try {
      const data = await Promise.race([
        Promise.resolve().then(() => {
          controller.signal.throwIfAborted()
          return provider.load(lon, lat, { signal: controller.signal })
        }),
        new Promise<never>((_, reject) => {
          onAbort = () => reject(controller.signal.reason ?? abortError())
          controller.signal.addEventListener('abort', onAbort, { once: true })
        })
      ])
      return { data: validate(data), fetchedAt: Date.now() }
    } finally {
      clearTimeout(timer)
      controller.signal.removeEventListener('abort', onAbort)
    }
  }

  private result(
    value: Cached,
    lon: number,
    lat: number,
    providerId: string,
    now: number
  ): RainForecast {
    const data = value.data
    const reference = data.mode === 'demo' ? Date.parse(data.referenceTime!) : now
    const firstEnd = (Math.floor(reference / HOUR) + 1) * HOUR
    const lastEnd = firstEnd + 47 * HOUR
    const byTime = new Map(data.hourly.map((hour) => [Date.parse(hour.end), hour]))
    const available = data.hourly.filter(
      (hour) => Date.parse(hour.end) >= firstEnd && Date.parse(hour.end) <= lastEnd
    )
    const hourly = []
    if (available.length) {
      // Fill interior missing hours, without inventing availability outside the supplied range.
      for (
        let end = Date.parse(available[0]!.end);
        end <= Date.parse(available.at(-1)!.end);
        end += HOUR
      )
        hourly.push({
          ...(byTime.get(end) ?? {
            start: new Date(end - HOUR).toISOString(),
            end: new Date(end).toISOString(),
            rain: null,
            probability: null,
            precipitation: null,
            snowfall: null
          })
        })
    }
    return {
      ...data,
      hourly,
      lon,
      lat,
      providerId,
      fetchedAt: new Date(value.fetchedAt).toISOString(),
      range: hourly.length ? { start: hourly[0]!.start, end: hourly.at(-1)!.end } : null
    }
  }
}

const defaultService = new RainForecastService()
export function getRainForecast(
  lon: number,
  lat: number,
  options?: RainForecastOptions
): Promise<RainForecast> {
  return defaultService.getRainForecast(lon, lat, options)
}

export function summarizeRainForecast(forecast: RainForecast): RainForecastSummary {
  const known = forecast.hourly.filter((hour) => hour.rain !== null)
  const wetPeriods: RainForecastSummary['wetPeriods'] = []
  for (const hour of forecast.hourly) {
    if (hour.rain === null || hour.rain < 0.1) continue
    const previous = wetPeriods.at(-1)
    if (previous?.end === hour.start) previous.end = hour.end
    else wetPeriods.push({ start: hour.start, end: hour.end })
  }
  return {
    totalRain: known.length ? known.reduce((sum, hour) => sum + hour.rain!, 0) : null,
    complete: forecast.hourly.length === 48 && known.length === 48,
    knownHours: known.length,
    wetPeriods
  }
}
