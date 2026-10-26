import { describe, expect, it } from 'vitest'
import {
  parseWeatherDataset,
  parseWeatherLayer,
  parseWeatherPoints,
  parseWeatherWarnings
} from '../src/data/parseWeatherJson'

const bounds = { west: 100, south: 20, east: 120, north: 30 }

describe('parseWeatherLayer', () => {
  it('解析网格帧并按时间排序', () => {
    const layer = parseWeatherLayer({
      kind: 'precip',
      frames: [
        {
          time: '2026-07-01T06:00:00Z',
          bounds,
          width: 2,
          height: 2,
          values: [1, 2, 3, 4]
        },
        {
          time: '2026-07-01T00:00:00Z',
          bounds,
          width: 2,
          height: 2,
          values: [5, 6, 7, 8]
        }
      ]
    })

    expect(layer.kind).toBe('precip')
    expect(layer.frames.map((frame) => frame.time.toISOString())).toEqual([
      '2026-07-01T00:00:00.000Z',
      '2026-07-01T06:00:00.000Z'
    ])
    expect(Array.from(layer.frames[0]!.values as Float32Array)).toEqual([5, 6, 7, 8])
    expect(layer.unit).toBe('mm/h')
    expect(layer.legend?.colors.length).toBeGreaterThan(0)
  })

  it('支持图片帧', () => {
    const frame = parseWeatherLayer({
      kind: 'radar',
      frames: [
        {
          time: '2026-07-01T00:00:00Z',
          bounds,
          imageUrl: '/data/radar/0.png'
        }
      ]
    }).frames[0]!

    expect(frame.imageUrl).toBe('/data/radar/0.png')
    expect(frame.values).toBeUndefined()
  })

  it('拒绝长度不匹配的网格', () => {
    expect(() =>
      parseWeatherLayer({
        kind: 'temperature',
        frames: [{ time: '2026-07-01T00:00:00Z', bounds, width: 2, height: 2, values: [1] }]
      })
    ).toThrow('长度不匹配')
  })

  it('拒绝未知图层类型', () => {
    expect(() =>
      parseWeatherLayer({
        kind: 'unknown',
        frames: [
          { time: '2026-07-01T00:00:00Z', bounds, width: 2, height: 2, values: [1, 2, 3, 4] }
        ]
      })
    ).toThrow('未知图层类型')
  })
})

describe('parseWeatherDataset', () => {
  it('解析多图层数据集', () => {
    const dataset = parseWeatherDataset({
      name: '样例',
      range: { start: '2026-07-01T00:00:00Z', end: '2026-07-02T00:00:00Z' },
      layers: [
        {
          kind: 'cloud',
          frames: [
            { time: '2026-07-01T00:00:00Z', bounds, width: 2, height: 2, values: [1, 2, 3, 4] }
          ]
        }
      ]
    })

    expect(dataset.layers).toHaveLength(1)
    expect(dataset.name).toBe('样例')
    expect(dataset.range?.start.toISOString()).toBe('2026-07-01T00:00:00.000Z')
  })

  it('把单个图层当作数据集', () => {
    const dataset = parseWeatherDataset({
      kind: 'humidity',
      frames: [{ time: '2026-07-01T00:00:00Z', bounds, width: 2, height: 2, values: [1, 2, 3, 4] }]
    })
    expect(dataset.layers).toHaveLength(1)
    expect(dataset.layers[0]!.kind).toBe('humidity')
  })

  it('解析点预报与预警', () => {
    const points = parseWeatherPoints({
      points: [
        {
          id: 'wuhan',
          name: '武汉',
          lon: 114.3,
          lat: 30.6,
          hourly: [{ time: '2026-07-01T00:00:00Z', temperature: 30 }]
        }
      ]
    })
    expect(points[0]?.hourly[0]?.temperature).toBe(30)

    const warnings = parseWeatherWarnings({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            id: 'w1',
            type: '暴雨',
            level: 'yellow',
            title: '暴雨预警',
            startTime: '2026-07-01T00:00:00Z',
            endTime: '2026-07-01T12:00:00Z'
          },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [112, 29],
                [116, 29],
                [116, 32],
                [112, 29]
              ]
            ]
          }
        }
      ]
    })
    expect(warnings[0]?.level).toBe('yellow')
  })
})
