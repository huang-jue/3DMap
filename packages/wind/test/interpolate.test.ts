import { describe, expect, it } from 'vitest'
import { interpolateWind } from '../src/data/interpolate'
import type { WindGrid } from '../src/shared/types'

const grid: WindGrid = {
  u: [0, 10, 20, 30],
  v: [1, 1, 1, 1],
  width: 2,
  height: 2,
  bounds: { west: 0, south: 0, east: 1, north: 1 }
}

describe('interpolateWind', () => {
  it('海陆缺测网格不返回 NaN 风速或方向', () => {
    expect(interpolateWind({ ...grid, u: [NaN, 10, 20, 30] }, 0.5, 0.5)).toBeNull()
  })
  it('在四个角返回原始值', () => {
    expect(interpolateWind(grid, 0, 0)).toMatchObject({ u: 0, v: 1 })
    expect(interpolateWind(grid, 1, 0)).toMatchObject({ u: 10, v: 1 })
    expect(interpolateWind(grid, 0, 1)).toMatchObject({ u: 20, v: 1 })
    expect(interpolateWind(grid, 1, 1)).toMatchObject({ u: 30, v: 1 })
  })

  it('在中心做双线性插值', () => {
    const sample = interpolateWind(grid, 0.5, 0.5)
    expect(sample?.u).toBeCloseTo(15)
    expect(sample?.speed).toBeCloseTo(Math.hypot(15, 1))
  })

  it('计算风速与风去向', () => {
    const eastward: WindGrid = {
      u: [1, 1, 1, 1],
      v: [0, 0, 0, 0],
      width: 2,
      height: 2,
      bounds: { west: 0, south: 0, east: 1, north: 1 }
    }
    const sample = interpolateWind(eastward, 0.5, 0.5)
    expect(sample?.speed).toBeCloseTo(1)
    expect(sample?.direction).toBeCloseTo(90)
  })

  it('范围外返回 null', () => {
    expect(interpolateWind(grid, -1, 0)).toBeNull()
    expect(interpolateWind(grid, 2, 0)).toBeNull()
  })
})
