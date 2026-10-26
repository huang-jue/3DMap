import type { WindGrid, WindSample } from '../shared/types'

function valueAt(data: Float32Array | number[], index: number): number {
  return data[index] ?? 0
}

/**
 * 在风场网格上做双线性插值。
 *
 * 网格约定：第 0 行是南侧，第 0 列是西侧。
 * 超出 bounds 返回 null。
 */
export function interpolateWind(grid: WindGrid, lon: number, lat: number): WindSample | null {
  const { bounds, width, height } = grid
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

  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
  const sample = (data: Float32Array | number[]): number => {
    const top = lerp(valueAt(data, i00), valueAt(data, i10), tx)
    const bottom = lerp(valueAt(data, i01), valueAt(data, i11), tx)
    return lerp(top, bottom, ty)
  }

  const u = sample(grid.u)
  const v = sample(grid.v)
  const speed = grid.speed ? sample(grid.speed) : Math.hypot(u, v)
  const direction = ((Math.atan2(u, v) * 180) / Math.PI + 360) % 360

  return { u, v, speed, direction }
}
