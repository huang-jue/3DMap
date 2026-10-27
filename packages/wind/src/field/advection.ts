import { interpolateWind } from '../data/interpolate'
import type { WindGrid } from '../shared/types'

const METERS_PER_DEGREE = 111_195

/** Midpoint integration in geographic coordinates; seconds are visual advection time. */
export function advectWind(grid: WindGrid, lon: number, lat: number, seconds: number) {
  const global = grid.bounds.east - grid.bounds.west >= 359.9
  const wrap = (x: number) =>
    global ? ((((x - grid.bounds.west) % 360) + 360) % 360) + grid.bounds.west : x
  const velocity = (x: number, y: number) => {
    const sample = interpolateWind(grid, wrap(x), y)
    if (!sample || !Number.isFinite(sample.u + sample.v)) return null
    return {
      x: sample.u / (METERS_PER_DEGREE * Math.max(0.08, Math.cos((y * Math.PI) / 180))),
      y: sample.v / METERS_PER_DEGREE,
      speed: Math.hypot(sample.u, sample.v)
    }
  }
  const first = velocity(lon, lat)
  if (!first) return null
  const middle = velocity(lon + (first.x * seconds) / 2, lat + (first.y * seconds) / 2)
  if (!middle) return null
  const next = {
    lon: wrap(lon + middle.x * seconds),
    lat: lat + middle.y * seconds,
    speed: middle.speed
  }
  if (
    next.lat < grid.bounds.south ||
    next.lat > grid.bounds.north ||
    Math.abs(next.lat) > 89.5 ||
    next.lon < grid.bounds.west ||
    next.lon > grid.bounds.east
  )
    return null
  return next
}
