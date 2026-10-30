import type { RainForecastData, RainForecastHour, RainForecastProvider } from './types'

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('降雨预报数据格式错误')
  return value as Record<string, unknown>
}

/** Parses the explicit GMT/Unix-time response, independent of browser timezone. */
export function parseOpenMeteoRain(input: unknown): RainForecastData {
  const data = record(input)
  if (data.error) throw new Error(`天气服务：${String(data.reason ?? '请求失败')}`)
  const hourly = record(data.hourly)
  const units = record(data.hourly_units)
  if (units.time !== 'unixtime' || !Array.isArray(hourly.time))
    throw new Error('天气服务未返回 UTC 小时时间')
  const numberAt = (key: string, index: number, unit: string, maximum = Infinity) => {
    const values = hourly[key]
    if (values === undefined) return null
    if (units[key] !== unit) throw new Error(`天气服务单位不匹配：${key}`)
    const value = Array.isArray(values) ? values[index] : null
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum
      ? value
      : null
  }
  const hours: RainForecastHour[] = hourly.time.map((value, index) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value % 3600 !== 0)
      throw new Error('天气服务返回了非法小时时间')
    const end = new Date(value * 1000).toISOString()
    const rain = numberAt('rain', index, 'mm')
    const showers = numberAt('showers', index, 'mm')
    return {
      start: new Date(value * 1000 - 3600_000).toISOString(),
      end,
      rain: rain === null || showers === null ? null : rain + showers,
      probability: numberAt('precipitation_probability', index, '%', 100),
      precipitation: numberAt('precipitation', index, 'mm'),
      snowfall: numberAt('snowfall', index, 'cm')
    }
  })
  return {
    mode: 'online',
    source: 'Open-Meteo',
    sourceUrl: 'https://open-meteo.com/',
    hourly: hours
  }
}

export const openMeteoRainProvider: RainForecastProvider = {
  id: 'open-meteo',
  async load(lon, lat, { signal }) {
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.search = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      hourly: 'rain,showers,precipitation_probability,precipitation,snowfall',
      forecast_days: '3',
      timezone: 'GMT',
      timeformat: 'unixtime'
    }).toString()
    const response = await fetch(url, { signal, cache: 'no-store' })
    if (!response.ok) throw new Error(`天气服务请求失败（HTTP ${response.status}）`)
    return parseOpenMeteoRain(await response.json())
  }
}
