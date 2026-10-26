import { describe, expect, it } from 'vitest'
import { findNearestTimeIndex, sampleTimeSeries } from '../src/data/timeSeries'

describe('sampleTimeSeries', () => {
  const series = [
    { time: '2026-07-01T00:00:00Z', value: 0 },
    { time: '2026-07-01T02:00:00Z', value: 20 }
  ]

  it('返回静态值', () => {
    expect(sampleTimeSeries(12.5, new Date())).toBe(12.5)
  })

  it('线性插值并处理边界', () => {
    expect(sampleTimeSeries(series, new Date('2026-06-30T00:00:00Z'))).toBe(0)
    expect(sampleTimeSeries(series, new Date('2026-07-01T01:00:00Z'))).toBe(10)
    expect(sampleTimeSeries(series, new Date('2026-07-01T03:00:00Z'))).toBe(20)
  })

  it('无数据返回 undefined', () => {
    expect(sampleTimeSeries(undefined, new Date())).toBeUndefined()
    expect(sampleTimeSeries([], new Date())).toBeUndefined()
  })
})

describe('findNearestTimeIndex', () => {
  it('选择时间上最接近的网格', () => {
    const grids = [
      { refTime: new Date('2026-07-01T00:00:00Z') },
      { refTime: new Date('2026-07-01T06:00:00Z') },
      { refTime: new Date('2026-07-01T12:00:00Z') }
    ]
    expect(findNearestTimeIndex(grids, new Date('2026-07-01T05:00:00Z'))).toBe(1)
    expect(findNearestTimeIndex(grids, new Date('2026-07-01T11:00:00Z'))).toBe(2)
  })
})
