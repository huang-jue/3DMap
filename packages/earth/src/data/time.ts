export function toDate(value: Date | string | number): Date {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`@sgyx/cesium-kit-earth: 非法时间 ${String(value)}`)
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

export function sampleRasterValue(
  values: Float32Array | number[],
  width: number,
  height: number,
  bounds: { west: number; south: number; east: number; north: number },
  lon: number,
  lat: number,
  interpolation: 'bilinear' | 'nearest',
  noData?: number
): number | null {
  if (lon < bounds.west || lon > bounds.east || lat < bounds.south || lat > bounds.north) {
    return null
  }
  const xNorm = ((lon - bounds.west) / (bounds.east - bounds.west)) * (width - 1)
  const yNorm = ((lat - bounds.south) / (bounds.north - bounds.south)) * (height - 1)
  if (interpolation === 'nearest') {
    const x = Math.max(0, Math.min(width - 1, Math.round(xNorm)))
    const y = Math.max(0, Math.min(height - 1, Math.round(yNorm)))
    const value = Number(values[y * width + x] ?? 0)
    if (!Number.isFinite(value) || (noData !== undefined && value === noData)) return null
    return value
  }
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(xNorm)))
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(yNorm)))
  const x1 = Math.min(x0 + 1, width - 1)
  const y1 = Math.min(y0 + 1, height - 1)
  const tx = xNorm - x0
  const ty = yNorm - y0
  const v00 = Number(values[y0 * width + x0] ?? 0)
  const v10 = Number(values[y0 * width + x1] ?? 0)
  const v01 = Number(values[y1 * width + x0] ?? 0)
  const v11 = Number(values[y1 * width + x1] ?? 0)
  if (
    !Number.isFinite(v00) ||
    !Number.isFinite(v10) ||
    !Number.isFinite(v01) ||
    !Number.isFinite(v11) ||
    (noData !== undefined && [v00, v10, v01, v11].some((value) => value === noData))
  ) {
    return null
  }
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
  const top = lerp(v00, v10, tx)
  const bottom = lerp(v01, v11, tx)
  return lerp(top, bottom, ty)
}
