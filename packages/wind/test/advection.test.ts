import { describe, expect, it } from 'vitest'
import { advectWind } from '../src/field/advection'
import { WindTimeInterpolator } from '../src/data/timeSeries'
import type { WindGrid } from '../src/shared/types'

const grid = (u: number, v: number): WindGrid => ({
  width: 3,
  height: 3,
  bounds: { west: -180, east: 180, south: -90, north: 90 },
  u: Array(9).fill(u),
  v: Array(9).fill(v)
})

describe('geographic wind advection', () => {
  it('wraps the dateline and integrates the same physical distance at latitude', () => {
    const field = grid(10, 0)
    expect(advectWind(field, 179.9, 0, 3600)?.lon).toBeCloseTo(-179.776, 2)
    const equator = advectWind(field, 0, 0, 3600)!
    const north = advectWind(field, 0, 60, 3600)!
    expect(north.lon).toBeCloseTo(equator.lon * 2, 4)
    expect(north.lat).toBe(60)
  })
  it('does not turn missing vectors into visible streamlines', () => {
    expect(advectWind(grid(NaN, 0), 0, 0, 3600)).toBeNull()
  })
})

describe('wind time interpolation', () => {
  it('interpolates u/v across opposing winds and clamps outside forecast range', () => {
    const a = { ...grid(10, 4), refTime: new Date('2026-10-27T00:00Z') }
    const b = { ...grid(-10, 8), refTime: new Date('2026-10-27T06:00Z') }
    const sampler = new WindTimeInterpolator([a, b])
    expect(sampler.at(new Date('2026-10-27T03:00Z'))?.u[0]).toBe(0)
    expect(sampler.at(new Date('2026-10-27T03:00Z'))?.v[0]).toBe(6)
    expect(sampler.at(new Date('2026-10-26T00:00Z'))).toBe(a)
    expect(sampler.at(new Date('2026-10-28T00:00Z'))).toBe(b)
    const output = sampler.at(new Date('2026-10-27T01:00Z'))!
    const values = output.u
    expect(sampler.at(new Date('2026-10-27T02:00Z'))?.u).toBe(values)
  })
})
