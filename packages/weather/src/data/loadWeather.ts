import { parseWeatherDataset, parseWeatherLayer } from './parseWeatherJson'
import type { WeatherDataset, WeatherLayerData } from '../shared/types'

function isLayerData(value: unknown): value is WeatherLayerData {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    'frames' in value
  )
}

function isDataset(value: unknown): value is WeatherDataset {
  return typeof value === 'object' && value !== null && 'layers' in value
}

function isJsonText(value: string): boolean {
  const text = value.trim()
  return text.startsWith('{') || text.startsWith('[')
}

async function fetchJson(url: string): Promise<unknown> {
  if (typeof fetch !== 'function') {
    throw new Error('@cesium-kit/weather: 当前环境没有 fetch，请直接传入天气数据')
  }
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `@cesium-kit/weather: 天气数据请求失败 ${response.status} ${response.statusText}`
    )
  }
  return response.json()
}

/** 加载单个天气图层。 */
export async function loadWeatherLayer(
  input: WeatherLayerData | string
): Promise<WeatherLayerData> {
  if (isLayerData(input)) return parseWeatherLayer(input)
  if (isJsonText(input)) return parseWeatherLayer(JSON.parse(input))
  return parseWeatherLayer(await fetchJson(input))
}

/** 加载完整天气数据集。 */
export async function loadWeatherDataset(
  input: WeatherDataset | WeatherLayerData | string
): Promise<WeatherDataset> {
  if (isDataset(input)) return parseWeatherDataset(input)
  if (isLayerData(input)) return parseWeatherDataset(input)
  if (isJsonText(input)) return parseWeatherDataset(JSON.parse(input))
  return parseWeatherDataset(await fetchJson(input))
}
