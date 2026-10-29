import { sharedDataRepository, type DataRequestOptions } from '@sgyx/cesium-kit-core'
import {
  parseWeatherDataset,
  parseWeatherLayer,
  parseWeatherPoints,
  parseWeatherWarnings
} from './parseWeatherJson'
import type {
  WeatherDataset,
  WeatherLayerData,
  WeatherPointForecast,
  WeatherWarning
} from '../shared/types'

function isLayerData(value: unknown): value is WeatherLayerData {
  return typeof value === 'object' && value !== null && 'kind' in value && 'frames' in value
}

function isDataset(value: unknown): value is WeatherDataset {
  return typeof value === 'object' && value !== null && 'layers' in value
}

function isJsonText(value: string): boolean {
  const text = value.trim()
  return text.startsWith('{') || text.startsWith('[')
}

function fetchJson(url: string, options: DataRequestOptions): Promise<unknown> {
  return sharedDataRepository.json(url, options)
}

/** 加载单个天气图层。 */
export async function loadWeatherLayer(
  input: WeatherLayerData | string,
  options: DataRequestOptions = {}
): Promise<WeatherLayerData> {
  if (isLayerData(input)) return parseWeatherLayer(input)
  if (isJsonText(input)) return parseWeatherLayer(JSON.parse(input))
  return parseWeatherLayer(await fetchJson(input, options))
}

/** 加载完整天气数据集。 */
export async function loadWeatherDataset(
  input: WeatherDataset | WeatherLayerData | string,
  options: DataRequestOptions = {}
): Promise<WeatherDataset> {
  if (isDataset(input)) return parseWeatherDataset(input)
  if (isLayerData(input)) return parseWeatherDataset(input)
  if (isJsonText(input)) return parseWeatherDataset(JSON.parse(input))
  return parseWeatherDataset(await fetchJson(input, options))
}

/** 加载城市/点预报。 */
export async function loadWeatherPoints(
  input: WeatherPointForecast[] | string,
  options: DataRequestOptions = {}
): Promise<WeatherPointForecast[]> {
  if (Array.isArray(input)) return parseWeatherPoints(input)
  if (isJsonText(input)) return parseWeatherPoints(JSON.parse(input))
  return parseWeatherPoints(await fetchJson(input, options))
}

/** 加载气象预警。 */
export async function loadWeatherWarnings(
  input: WeatherWarning[] | string,
  options: DataRequestOptions = {}
): Promise<WeatherWarning[]> {
  if (Array.isArray(input)) return input
  if (isJsonText(input)) return parseWeatherWarnings(JSON.parse(input))
  return parseWeatherWarnings(await fetchJson(input, options))
}
