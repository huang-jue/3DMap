import type { WeatherFrame, WeatherLayerKind, WeatherValueSample } from '../shared/types'

function valueAt(values: Float32Array | number[], index: number): number {
  return Number(values[index] ?? 0)
}

function isNoData(value: number, noData: number | undefined): boolean {
  if (!Number.isFinite(value)) return true
  return noData !== undefined && value === noData
}

/** 在天气网格上做双线性插值；无数据或越界返回 null。 */
export function sampleFrame(frame: WeatherFrame, lon: number, lat: number): number | null {
  const { bounds, width, height, values, noData } = frame
  if (!width || !height || !values) return null
  if (lon < bounds.west || lon > bounds.east || lat < bounds.south || lat > bounds.north) {
    return null
  }

  const xNorm = ((lon - bounds.west) / (bounds.east - bounds.west)) * (width - 1)
  const yNorm = ((lat - bounds.south) / (bounds.north - bounds.south)) * (height - 1)
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(xNorm)))
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(yNorm)))
  const x1 = Math.min(x0 + 1, width - 1)
  const y1 = Math.min(y0 + 1, height - 1)
  const tx = xNorm - x0
  const ty = yNorm - y0

  const i00 = y0 * width + x0
  const i10 = y0 * width + x1
  const i01 = y1 * width + x0
  const i11 = y1 * width + x1

  const v00 = valueAt(values, i00)
  const v10 = valueAt(values, i10)
  const v01 = valueAt(values, i01)
  const v11 = valueAt(values, i11)
  if (
    isNoData(v00, noData) ||
    isNoData(v10, noData) ||
    isNoData(v01, noData) ||
    isNoData(v11, noData)
  ) {
    return null
  }

  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
  const top = lerp(v00, v10, tx)
  const bottom = lerp(v01, v11, tx)
  const value = lerp(top, bottom, ty)
  return Number.isFinite(value) ? value : null
}

/** 返回带图层信息的采样结果。 */
export function sampleWeatherValue(
  kind: WeatherLayerKind,
  unit: string | undefined,
  frame: WeatherFrame,
  lon: number,
  lat: number
): WeatherValueSample | null {
  const value = sampleFrame(frame, lon, lat)
  if (value === null) return null
  return {
    kind,
    value,
    unit,
    time: frame.time,
    frame
  }
}
