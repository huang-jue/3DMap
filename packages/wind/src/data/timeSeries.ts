import type { NumericSeries, TimeSeriesPoint } from '../shared/types'

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
export function sampleTimeSeries(series: NumericSeries | undefined, time: Date): number | undefined {
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
