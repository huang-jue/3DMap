import { describe, expect, it } from 'vitest'
import { parseWindJson } from '../src/data/parseWindJson'

describe('parseWindJson', () => {
  it('preserves JSON null as missing ocean vectors instead of inventing zero velocity', () => {
    const grid = parseWindJson({ width: 2, height: 2, bounds: { west: 0, south: 0, east: 1, north: 1 },
      u: [null, 0, 1, 2], v: [null, 0, 3, 4] })
    expect(Number.isNaN(grid.u[0])).toBe(true)
    expect(Number.isNaN(grid.v[0])).toBe(true)
    expect(grid.u[1]).toBe(0)
  })
  it('解析原生 WindGrid 并保持南到北行序', () => {
    const grid = parseWindJson({
      u: [0, 1, 2, 3, 4, 5],
      v: [6, 7, 8, 9, 10, 11],
      width: 3,
      height: 2,
      bounds: { west: 100, south: 20, east: 120, north: 30 }
    })

    expect(grid.width).toBe(3)
    expect(grid.height).toBe(2)
    expect(grid.bounds).toEqual({ west: 100, south: 20, east: 120, north: 30 })
    expect(Array.from(grid.u)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('原生数据指定北到南时翻转行序', () => {
    const grid = parseWindJson(
      {
        u: [1, 2, 3, 4],
        v: [5, 6, 7, 8],
        width: 2,
        height: 2,
        bounds: { west: 0, south: 0, east: 1, north: 1 }
      },
      { rowOrder: 'north' }
    )

    expect(Array.from(grid.u)).toEqual([3, 4, 1, 2])
    expect(Array.from(grid.v)).toEqual([7, 8, 5, 6])
  })

  it('解析 GFS/Windy 格式并翻转南北行序', () => {
    const grid = parseWindJson({
      header: { lo1: 0, la1: 30, dx: 10, dy: 10, nx: 4, ny: 3 },
      data: [
        {
          header: { parameterNumber: 2, lo1: 0, la1: 30, dx: 10, dy: 10, nx: 4, ny: 3 },
          data: Array.from({ length: 12 }, (_, i) => i)
        },
        {
          header: { parameterNumber: 3, lo1: 0, la1: 30, dx: 10, dy: 10, nx: 4, ny: 3 },
          data: Array.from({ length: 12 }, (_, i) => i + 100)
        }
      ]
    })

    expect(grid.width).toBe(4)
    expect(grid.height).toBe(3)
    expect(grid.bounds).toEqual({ west: 0, south: 10, east: 30, north: 30 })
    // 原数据第一行是北侧 [0,1,2,3]，翻转后最后一行是北侧
    expect(Array.from(grid.u)).toEqual([8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3])
    expect(Array.from(grid.v)).toEqual([108, 109, 110, 111, 104, 105, 106, 107, 100, 101, 102, 103])
  })

  it('解析跨 180 度经线的 GFS 数据', () => {
    const grid = parseWindJson({
      data: [
        {
          header: {
            parameterNumber: 2,
            lo1: 0,
            la1: 10,
            la2: 10,
            dx: 90,
            dy: 0,
            nx: 4,
            ny: 2
          },
          data: [0, 1, 2, 3, 4, 5, 6, 7]
        },
        {
          header: { parameterNumber: 3 },
          data: [0, 0, 0, 0, 0, 0, 0, 0]
        }
      ]
    })

    expect(grid.bounds.west).toBe(-180)
    expect(grid.bounds.east).toBe(90)
    // 列被滚动到 -180 起始
    expect(Array.from(grid.u.slice(0, 4))).toEqual([2, 3, 0, 1])
  })

  it('拒绝无法识别的数据', () => {
    expect(() => parseWindJson({ foo: 1 })).toThrow('无法识别')
    expect(() => parseWindJson({ u: [1], v: [2], width: 2, height: 1, bounds: {} })).toThrow()
  })
})
