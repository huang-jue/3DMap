import { describe, expect, it } from 'vitest'
import { sampleFrame, sampleWeatherValue } from '../src/data/interpolate'
import type { WeatherFrame } from '../src/shared/types'

const bounds = { west: 0, south: 0, east: 10, north: 10 }

function frame(values: number[], noData?: number): WeatherFrame {
  return {
    time: new Date('2026-07-01T00:00:00Z'),
    bounds,
    width: 3,
    height: 2,
    values,
    ...(noData !== undefined ? { noData } : {})
  }
}

describe('sampleFrame', () => {
  it('双线性插值', () => {
    const value = sampleFrame(frame([0, 10, 20, 10, 20, 30]), 5, 5)
    expect(value).toBe(15)
  })

  it('越界返回 null', () => {
    expect(sampleFrame(frame([0, 10, 20, 10, 20, 30]), 11, 5)).toBeNull()
  })

  it('无数据返回 null', () => {
    expect(sampleFrame(frame([0, -999, 20, 10, 20, 30], -999), 5, 0)).toBeNull()
  })

  it('图片帧不参与数值采样', () => {
    expect(
      sampleFrame(
        {
          time: new Date(),
          bounds,
          imageUrl: '/radar.png'
        },
        5,
        5
      )
    ).toBeNull()
  })
})

describe('sampleWeatherValue', () => {
  it('返回时间和单位', () => {
    const sample = sampleWeatherValue('precip', 'mm/h', frame([0, 10, 20, 10, 20, 30]), 5, 5)
    expect(sample).toMatchObject({ kind: 'precip', value: 15, unit: 'mm/h' })
  })
})
