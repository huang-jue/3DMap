export interface TimeRange {
  start: Date
  end: Date
}

export function toDate(value: Date | string | number): Date {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`@sgyx/cesium-kit-flood: 非法时间 ${String(value)}`)
  }
  return date
}

export function findNearestIndex<T extends { time: Date }>(items: T[], time: Date): number {
  let best = -1
  let distance = Number.POSITIVE_INFINITY
  const now = time.getTime()
  items.forEach((item, index) => {
    const next = Math.abs(item.time.getTime() - now)
    if (next < distance) {
      distance = next
      best = index
    }
  })
  return best
}

export function nearestItem<T extends { time: Date }>(items: T[], time: Date): T | null {
  const index = findNearestIndex(items, time)
  return index >= 0 ? (items[index] ?? null) : null
}

export function sampleSeries(
  series: Array<{ time: Date; value: number }>,
  time: Date
): number | null {
  if (series.length === 0) return null
  const sorted = series.slice().sort((a, b) => a.time.getTime() - b.time.getTime())
  const now = time.getTime()
  const first = sorted[0]!
  const last = sorted[sorted.length - 1]!
  if (now <= first.time.getTime()) return first.value
  if (now >= last.time.getTime()) return last.value
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]!
    const next = sorted[i]!
    if (now <= next.time.getTime()) {
      const span = next.time.getTime() - prev.time.getTime()
      if (span <= 0) return next.value
      const ratio = (now - prev.time.getTime()) / span
      return prev.value + (next.value - prev.value) * ratio
    }
  }
  return last.value
}

export function itemsRange<T extends { time: Date }>(items: T[]): TimeRange | null {
  if (items.length === 0) return null
  let start = items[0]!.time
  let end = items[0]!.time
  items.forEach((item) => {
    if (item.time.getTime() < start.getTime()) start = item.time
    if (item.time.getTime() > end.getTime()) end = item.time
  })
  return { start: new Date(start), end: new Date(end) }
}
