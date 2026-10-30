import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseOpenMeteoRain, openMeteoRainProvider } from '../src/forecast/openMeteo'
import { RainForecastService, summarizeRainForecast } from '../src/forecast/getRainForecast'
import type { RainForecastData, RainForecastProvider } from '../src/forecast/types'

const NOW = Date.parse('2026-10-29T23:30:00Z')
const HOUR = 3600_000
function source(): RainForecastData {
  return {
    mode: 'online',
    source: 'test',
    hourly: Array.from({ length: 49 }, (_, index) => {
      const end = Math.floor(NOW / HOUR) * HOUR + index * HOUR
      return {
        start: new Date(end - HOUR).toISOString(),
        end: new Date(end).toISOString(),
        rain: 0,
        probability: 0,
        precipitation: 0,
        snowfall: 0
      }
    })
  }
}
function provider(): RainForecastProvider & { load: ReturnType<typeof vi.fn> } {
  return { id: 'test', load: vi.fn(async () => source()) }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function raw() {
  return {
    hourly_units: {
      time: 'unixtime',
      rain: 'mm',
      showers: 'mm',
      precipitation: 'mm',
      precipitation_probability: '%',
      snowfall: 'cm'
    },
    hourly: {
      time: [1793318400, 1793322000],
      rain: [1, null],
      showers: [0.2, 2],
      precipitation: [3, 6],
      precipitation_probability: [0, null],
      snowfall: [0.4, 0]
    }
  }
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('rain forecast normalization', () => {
  it('combines rain and showers, preserves zero probability, nulls and snow units', () => {
    const result = parseOpenMeteoRain(raw())
    expect(result.hourly[0]).toMatchObject({
      rain: 1.2,
      precipitation: 3,
      probability: 0,
      snowfall: 0.4
    })
    expect(result.hourly[1]).toMatchObject({ rain: null, precipitation: 6, probability: null })
    expect(Date.parse(result.hourly[0]!.end) - Date.parse(result.hourly[0]!.start)).toBe(HOUR)
    expect(result.hourly[0]!.end).toMatch(/Z$/)
  })
  it('does not infer missing rain from total precipitation or absent fields', () => {
    const input = raw()
    delete (input.hourly as Partial<typeof input.hourly>).showers
    expect(parseOpenMeteoRain(input).hourly.map((hour) => hour.rain)).toEqual([null, null])
  })
  it('rejects incorrect units/times and preserves invalid numbers as missing', () => {
    const input = raw()
    input.hourly_units.rain = 'inch'
    expect(() => parseOpenMeteoRain(input)).toThrow('单位')
    input.hourly_units.rain = 'mm'
    input.hourly.precipitation_probability[0] = 101
    input.hourly.rain[0] = -1
    expect(parseOpenMeteoRain(input).hourly[0]).toMatchObject({ rain: null, probability: null })
    input.hourly.time[0] = 1
    expect(() => parseOpenMeteoRain(input)).toThrow('时间')
  })
  it('requests GMT epoch hours and all five fields, without browser HTTP cache', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(raw())))
    vi.stubGlobal('fetch', fetcher)
    await openMeteoRainProvider.load(104, 30, { signal: new AbortController().signal })
    const [url, options] = fetcher.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.searchParams.get('timezone')).toBe('GMT')
    expect(url.searchParams.get('timeformat')).toBe('unixtime')
    expect(url.searchParams.get('hourly')).toContain('snowfall')
    expect(options.cache).toBe('no-store')
  })
})

describe('forecast windows and summaries', () => {
  it('returns 48 future hour endings across UTC midnight, using real time', async () => {
    const result = await new RainForecastService().getRainForecast(104, 30, {
      provider: provider()
    })
    expect(result.hourly).toHaveLength(48)
    expect(result.hourly[0]!.end).toBe('2026-10-30T00:00:00.000Z')
    expect(result.range).toEqual({
      start: '2026-10-29T23:00:00.000Z',
      end: '2026-10-31T23:00:00.000Z'
    })
    expect(summarizeRainForecast(result)).toMatchObject({
      totalRain: 0,
      complete: true,
      knownHours: 48
    })
  })
  it('uses the next hour even when now is exactly on the hour', async () => {
    vi.setSystemTime(Date.parse('2026-10-30T00:00:00Z'))
    const result = await new RainForecastService().getRainForecast(104, 30, {
      provider: provider()
    })
    expect(result.hourly[0]!.end).toBe('2026-10-30T01:00:00.000Z')
    expect(result.hourly).toHaveLength(47)
    expect(summarizeRainForecast(result).complete).toBe(false)
  })
  it('fills interior gaps and merges wet intervals without crossing missing data', async () => {
    const data = source()
    data.hourly[1]!.rain = 0.1
    data.hourly[2]!.rain = 1.5
    data.hourly[4]!.rain = 0.2
    data.hourly.splice(3, 1)
    const result = await new RainForecastService().getRainForecast(104, 30, {
      provider: { id: 'partial', load: async () => data }
    })
    expect(result.hourly[2]!.rain).toBeNull()
    const summary = summarizeRainForecast(result)
    expect(summary.complete).toBe(false)
    expect(summary.knownHours).toBe(47)
    expect(summary.totalRain).toBeCloseTo(1.8)
    expect(summary.wetPeriods).toHaveLength(2)
    expect(summary.wetPeriods[0]).toEqual({
      start: result.hourly[0]!.start,
      end: result.hourly[1]!.end
    })
  })
  it('reports partial, all-missing and unavailable forecasts honestly', async () => {
    const data = source()
    data.hourly = data.hourly.slice(0, 4).map((hour) => ({ ...hour, rain: null }))
    const service = new RainForecastService()
    const selected = { id: 'missing', load: async () => data }
    const result = await service.getRainForecast(104, 30, { provider: selected })
    expect(summarizeRainForecast(result)).toMatchObject({
      totalRain: null,
      complete: false,
      knownHours: 0
    })
    vi.setSystemTime(NOW + 72 * HOUR)
    const empty = await service.getRainForecast(104, 30, { provider: selected })
    expect(empty.hourly).toHaveLength(0)
    expect(empty.range).toBeNull()
  })
  it('keeps demo times fixed, unrelated to current date', async () => {
    const data = { ...source(), mode: 'demo' as const, referenceTime: new Date(NOW).toISOString() }
    vi.setSystemTime(NOW + 365 * 24 * HOUR)
    const result = await new RainForecastService().getRainForecast(104, 30, {
      provider: { id: 'demo', load: async () => data }
    })
    expect(result.hourly).toHaveLength(48)
    expect(result.hourly[0]!.end).toBe('2026-10-30T00:00:00.000Z')
  })
})

describe('rain request lifecycle', () => {
  it('uses five-decimal cache coordinates while preserving requested coordinates', async () => {
    const selected = provider()
    const service = new RainForecastService()
    await service.getRainForecast(104.00000001, 30.00000001, { provider: selected })
    const result = await service.getRainForecast(104.00000002, 30.00000002, { provider: selected })
    expect(selected.load).toHaveBeenCalledTimes(1)
    expect(result.lon).toBe(104.00000002)
    await service.getRainForecast(104.0001, 30, { provider: selected })
    expect(selected.load).toHaveBeenCalledTimes(2)
  })
  it('shares a pending request and detaches only the cancelled consumer', async () => {
    const next = deferred<RainForecastData>()
    let signal!: AbortSignal
    const selected = {
      id: 'pending',
      load: vi.fn(async (_lon: number, _lat: number, options: { signal: AbortSignal }) => {
        signal = options.signal
        return next.promise
      })
    }
    const service = new RainForecastService()
    const first = new AbortController()
    const a = service.getRainForecast(104, 30, { provider: selected, signal: first.signal })
    const b = service.getRainForecast(104, 30, { provider: selected })
    await Promise.resolve()
    const rejected = expect(a).rejects.toMatchObject({ name: 'AbortError' })
    first.abort()
    await rejected
    expect(signal.aborted).toBe(false)
    next.resolve(source())
    expect((await b).hourly).toHaveLength(48)
    expect(selected.load).toHaveBeenCalledTimes(1)
  })
  it('aborts the underlying request when all consumers leave and permits immediate requery', async () => {
    const next = deferred<RainForecastData>()
    let signal!: AbortSignal
    const selected = {
      id: 'pending',
      load: vi.fn(async (_lon: number, _lat: number, options: { signal: AbortSignal }) => {
        signal = options.signal
        return next.promise
      })
    }
    const service = new RainForecastService()
    const abort = new AbortController()
    const first = service.getRainForecast(104, 30, { provider: selected, signal: abort.signal })
    await Promise.resolve()
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    abort.abort()
    await rejected
    expect(signal.aborted).toBe(true)
    selected.load.mockImplementation(async () => source())
    const second = await service.getRainForecast(104, 30, { provider: selected })
    next.resolve({ ...source(), hourly: [] })
    expect(second.hourly).toHaveLength(48)
    expect((await service.getRainForecast(104, 30, { provider: selected })).hourly).toHaveLength(48)
    expect(selected.load).toHaveBeenCalledTimes(2)
  })
  it('expires cached data after ten minutes and refresh bypasses cache', async () => {
    const selected = provider()
    const service = new RainForecastService()
    const first = await service.getRainForecast(104, 30, { provider: selected })
    first.hourly[0]!.rain = 999
    expect((await service.getRainForecast(104, 30, { provider: selected })).hourly[0]!.rain).toBe(0)
    expect(selected.load).toHaveBeenCalledTimes(1)
    await service.getRainForecast(104, 30, { provider: selected, forceRefresh: true })
    expect(selected.load).toHaveBeenCalledTimes(2)
    vi.setSystemTime(NOW + 600_000)
    await service.getRainForecast(104, 30, { provider: selected })
    expect(selected.load).toHaveBeenCalledTimes(3)
  })
  it('evicts the least recently used point above 64 entries', async () => {
    const selected = provider()
    const service = new RainForecastService()
    for (let lon = 0; lon < 64; lon++)
      await service.getRainForecast(lon, 30, { provider: selected })
    await service.getRainForecast(0, 30, { provider: selected })
    await service.getRainForecast(64, 30, { provider: selected })
    await service.getRainForecast(0, 30, { provider: selected })
    expect(selected.load).toHaveBeenCalledTimes(65)
    await service.getRainForecast(1, 30, { provider: selected })
    expect(selected.load).toHaveBeenCalledTimes(66)
  })
  it('a late old request cannot overwrite a newer refresh', async () => {
    const a = deferred<RainForecastData>()
    const b = deferred<RainForecastData>()
    const selected = {
      id: 'race',
      load: vi.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
    }
    const service = new RainForecastService()
    const first = service.getRainForecast(104, 30, { provider: selected })
    const second = service.getRainForecast(104, 30, { provider: selected, forceRefresh: true })
    const newer = source()
    newer.hourly.forEach((hour) => {
      hour.rain = 9
    })
    b.resolve(newer)
    await second
    a.resolve(source())
    await first
    expect((await service.getRainForecast(104, 30, { provider: selected })).hourly[0]!.rain).toBe(9)
  })
  it('enforces a 15-second timeout even for a provider ignoring cancellation, then retries', async () => {
    const selected = {
      id: 'timeout',
      load: vi
        .fn()
        .mockImplementationOnce(() => new Promise(() => undefined))
        .mockResolvedValueOnce(source())
    }
    const service = new RainForecastService()
    const first = service.getRainForecast(104, 30, { provider: selected })
    const rejected = expect(first).rejects.toMatchObject({ name: 'TimeoutError' })
    await vi.advanceTimersByTimeAsync(15_000)
    await rejected
    expect((await service.getRainForecast(104, 30, { provider: selected })).hourly).toHaveLength(48)
  })
  it('isolates providers and rejects invalid coordinates before making a request', async () => {
    const a = provider()
    const b = provider()
    const service = new RainForecastService()
    await service.getRainForecast(104, 30, { provider: a })
    await service.getRainForecast(104, 30, { provider: b })
    expect(b.load).toHaveBeenCalledTimes(1)
    await expect(service.getRainForecast(181, 30, { provider: a })).rejects.toThrow('经纬度')
    expect(a.load).toHaveBeenCalledTimes(1)
  })
})
