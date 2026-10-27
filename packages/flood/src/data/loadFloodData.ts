import { parseFloodDataset } from './parseFloodData'
import type { FloodDataset } from '../shared/types'

function isFloodDataset(value: unknown): value is FloodDataset {
  return (
    typeof value === 'object' && value !== null && 'rivers' in value && 'forecastNodes' in value
  )
}

function isJsonText(value: string): boolean {
  const text = value.trim()
  return text.startsWith('{') || text.startsWith('[')
}

export async function loadFloodDataset(input: FloodDataset | string): Promise<FloodDataset> {
  if (isFloodDataset(input)) return parseFloodDataset(input)
  if (isJsonText(input)) return parseFloodDataset(JSON.parse(input))
  if (typeof fetch !== 'function') {
    throw new Error('@sgyx/cesium-kit-flood: 当前环境没有 fetch，请直接传入数据对象')
  }
  const response = await fetch(input)
  if (!response.ok) {
    throw new Error(
      `@sgyx/cesium-kit-flood: 数据请求失败 ${response.status} ${response.statusText}`
    )
  }
  return parseFloodDataset(await response.json())
}
