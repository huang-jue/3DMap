import {
  sharedDataRepository,
  readFloatBinary,
  dataUrl,
  type FrameSource,
  type DataRequestOptions
} from '@sgyx/cesium-kit-core'
import type { ParseWindOptions, WindGrid } from '../shared/types'
import { parseWindJson } from './parseWindJson'

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
export async function openWindSource(
  input: WindGrid | WindGrid[] | string,
  parse: ParseWindOptions = {},
  options: DataRequestOptions = {}
): Promise<FrameSource<WindGrid>> {
  if (typeof input !== 'string' || isJsonText(input)) {
    const grids =
      typeof input === 'string'
        ? parseWindPayload(JSON.parse(input), parse)
        : Array.isArray(input)
          ? input
          : [input]
    grids.sort((a, b) => (a.refTime?.getTime() ?? 0) - (b.refTime?.getTime() ?? 0))
    return {
      times: grids.map((grid) => grid.refTime ?? new Date(0)),
      async getFrame(index, request = {}) {
        request.signal?.throwIfAborted()
        const grid = grids[index]
        if (!grid) throw new Error('帧索引越界')
        return grid
      }
    }
  }
  const payload = (await sharedDataRepository.json(input, options)) as Record<string, unknown>
  if (payload?.format === 'wind-f32-v1' || payload?.format === 'wind-f32-series-v1') {
    const raw = payload.format === 'wind-f32-series-v1' ? payload.frames : [payload]
    if (!Array.isArray(raw) || !raw.length) throw new Error('Empty binary vector series')
    const frames = raw
      .map((frame) => {
        if (
          !frame ||
          !Number.isInteger(frame.width) ||
          !Number.isInteger(frame.height) ||
          frame.width <= 0 ||
          frame.height <= 0 ||
          frame.width * frame.height > 20_000_000 ||
          typeof frame.binary !== 'string'
        )
          throw new Error('非法二进制网格尺寸')
        const time = new Date(frame.refTime ?? 0)
        if (!Number.isFinite(time.getTime())) throw new Error('非法风场时间')
        return { frame, time, url: dataUrl(frame.binary, input) }
      })
      .sort((a, b) => a.time.getTime() - b.time.getTime())
    return {
      times: frames.map((frame) => frame.time),
      async getFrame(index, request = {}) {
        const item = frames[index]
        if (!item) throw new Error('帧索引越界')
        return sharedDataRepository.load(
          `wind:${item.url}:${JSON.stringify(item.frame)}:${JSON.stringify(parse)}`,
          async (signal) => {
            const count = item.frame.width * item.frame.height
            const values = await readFloatBinary(item.url, count * 2, signal)
            return parseWindJson(
              { ...item.frame, u: values.subarray(0, count), v: values.subarray(count) },
              parse
            )
          },
          { ...options, ...request }
        )
      }
    }
  }
  const grids = parseWindPayload(payload, parse).sort(
    (a, b) => (a.refTime?.getTime() ?? 0) - (b.refTime?.getTime() ?? 0)
  )
  return {
    times: grids.map((grid) => grid.refTime ?? new Date(0)),
    async getFrame(index) {
      const grid = grids[index]
      if (!grid) throw new Error('帧索引越界')
      return grid
    }
  }
}

export async function loadWindGrids(
  input: WindGrid | WindGrid[] | string,
  options: ParseWindOptions = {},
  request: DataRequestOptions = {}
): Promise<WindGrid[]> {
  const source = await openWindSource(input, options, request)
  return Promise.all(source.times.map((_, i) => source.getFrame(i, request)))
}

/** 加载并返回第一份风场网格。 */
export async function loadWindGrid(
  input: WindGrid | WindGrid[] | string,
  options: ParseWindOptions = {},
  request: DataRequestOptions = {}
): Promise<WindGrid> {
  const grids = await loadWindGrids(input, options, request)
  const first = grids[0]
  if (!first) throw new Error('@cesium-kit/wind: 风场数据为空')
  return first
}
