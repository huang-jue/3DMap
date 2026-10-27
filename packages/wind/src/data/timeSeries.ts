import type { NumericSeries, TimeSeriesPoint } from '../shared/types'

import type { WindGrid } from '../shared/types'

interface NormalizedPoint {
  time: number
  value: number
}

const seriesCache = new WeakMap<TimeSeriesPoint[], NormalizedPoint[]>()

function toTimestamp(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime()
}

function normalizeSeries(series: TimeSeriesPoint[]): NormalizedPoint[] {
  const cached = seriesCache.get(series)
  if (cached) return cached

  const points = series
    .map((point) => ({ time: toTimestamp(point.time), value: point.value }))
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value))
    .sort((a, b) => a.time - b.time)

  seriesCache.set(series, points)
  return points
}

/** 返回时间序列在指定时刻的线性插值；无有效数据返回 undefined。 */
export function sampleTimeSeries(
  series: NumericSeries | undefined,
  time: Date
): number | undefined {
  if (series === undefined) return undefined
  if (typeof series === 'number') return Number.isFinite(series) ? series : undefined
  if (!Array.isArray(series) || series.length === 0) return undefined

  const points = normalizeSeries(series)
  if (points.length === 0) return undefined

  const now = time.getTime()
  const first = points[0] as NormalizedPoint
  const last = points[points.length - 1] as NormalizedPoint
  if (now <= first.time) return first.value
  if (now >= last.time) return last.value

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1] as NormalizedPoint
    const next = points[i] as NormalizedPoint
    if (now <= next.time) {
      const span = next.time - prev.time
      if (span <= 0) return next.value
      const ratio = (now - prev.time) / span
      return prev.value + (next.value - prev.value) * ratio
    }
  }

  return last.value
}

/** 找到时间上最接近当前时刻的网格索引。 */
export function findNearestTimeIndex(grids: Array<{ refTime?: Date }>, time: Date): number {
  let best = 0
  let bestDistance = Number.POSITIVE_INFINITY
  grids.forEach((grid, index) => {
    const timestamp = grid.refTime?.getTime()
    if (timestamp === undefined) return
    const distance = Math.abs(timestamp - time.getTime())
    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  })
  return best
}

/** Reuses typed buffers; interpolate vector components rather than directions. */
export class WindTimeInterpolator {
  private output: WindGrid | undefined
  constructor(private readonly grids: WindGrid[]) {}

  at(time: Date): WindGrid | undefined {
    const now = time.getTime()
    const sorted = this.grids
    if (!sorted.length) return undefined
    const nextIndex = sorted.findIndex((grid) => (grid.refTime?.getTime() ?? Infinity) >= now)
    if (nextIndex <= 0) return nextIndex === 0 ? sorted[0] : sorted.at(-1)
    const a = sorted[nextIndex - 1]!
    const b = sorted[nextIndex]!
    const start = a.refTime?.getTime() ?? now
    const end = b.refTime?.getTime() ?? now
    const ratio = (now - start) / (end - start)
    if (
      !(ratio > 0 && ratio < 1) ||
      a.width !== b.width ||
      a.height !== b.height ||
      Object.keys(a.bounds).some(
        (key) => a.bounds[key as keyof typeof a.bounds] !== b.bounds[key as keyof typeof b.bounds]
      )
    ) {
      return ratio >= 0.5 ? b : a
    }
    if (!this.output || this.output.width !== a.width || this.output.height !== a.height) {
      this.output = {
        width: a.width,
        height: a.height,
        bounds: a.bounds,
        u: new Float32Array(a.u.length),
        v: new Float32Array(a.v.length)
      }
    }
    for (let i = 0; i < a.u.length; i++) {
      this.output.u[i] = a.u[i]! + (b.u[i]! - a.u[i]!) * ratio
      this.output.v[i] = a.v[i]! + (b.v[i]! - a.v[i]!) * ratio
    }
    this.output.bounds = a.bounds
    this.output.refTime = time
    return this.output
  }
}
