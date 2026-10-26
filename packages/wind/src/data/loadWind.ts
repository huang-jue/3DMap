import type { ParseWindOptions, WindGrid } from '../shared/types'
import { parseWindJson } from './parseWindJson'

function isWindGrid(value: unknown): value is WindGrid {
  return (
    typeof value === 'object' &&
    value !== null &&
    'u' in value &&
    'v' in value &&
    'width' in value &&
    'height' in value &&
    'bounds' in value
  )
}

function isJsonText(value: string): boolean {
  const text = value.trim()
  return text.startsWith('{') || text.startsWith('[')
}

/** 把 JSON 负载解析为一组风场网格。 */
export function parseWindPayload(payload: unknown, options: ParseWindOptions = {}): WindGrid[] {
  if (Array.isArray(payload)) {
    return payload.map((item) => parseWindJson(item, options))
  }
  return [parseWindJson(payload, options)]
}

/**
 * 加载风场数据。
 *
 * - `WindGrid`：直接返回
 * - JSON 字符串：直接解析
 * - URL：fetch 后解析
 */
export async function loadWindGrids(
  input: WindGrid | WindGrid[] | string,
  options: ParseWindOptions = {}
): Promise<WindGrid[]> {
  if (Array.isArray(input)) return input
  if (isWindGrid(input)) return [input]

  if (isJsonText(input)) {
    return parseWindPayload(JSON.parse(input), options)
  }

  if (typeof fetch !== 'function') {
    throw new Error('@cesium-kit/wind: 当前环境没有 fetch，请直接传入已解析的风场数据')
  }

  const response = await fetch(input)
  if (!response.ok) {
    throw new Error(`@cesium-kit/wind: 风场数据请求失败 ${response.status} ${response.statusText}`)
  }
  return parseWindPayload(await response.json(), options)
}

/** 加载并返回第一份风场网格。 */
export async function loadWindGrid(
  input: WindGrid | WindGrid[] | string,
  options: ParseWindOptions = {}
): Promise<WindGrid> {
  const grids = await loadWindGrids(input, options)
  const first = grids[0]
  if (!first) throw new Error('@cesium-kit/wind: 风场数据为空')
  return first
}
