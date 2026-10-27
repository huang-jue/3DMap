import { describe, expect, it } from 'vitest'
import { parseEarthManifest, parseEarthScalarData } from '../src/data/parseEarthManifest'
import { parseEarthAnnotations } from '../src/data/loadEarthData'
import { sampleRasterValue } from '../src/data/time'

const bounds = { west: -180, south: -80, east: 180, north: 80 }

function manifest() {
  return {
    name: '样例',
    source: 'test',
    range: { start: '2026-07-01T00:00:00Z', end: '2026-07-01T06:00:00Z' },
    bounds,
    modes: [
      {
        id: 'atmosphere',
        label: '大气',
        vectors: [
          {
            id: 'wind',
            label: '风',
            unit: 'm/s',
            data: '/data/earth/atmosphere/wind.json'
          }
        ],
        overlays: [
          {
            id: 'temperature',
            label: '温度',
            unit: '°C',
            data: '/data/earth/atmosphere/temperature.json',
            min: -40,
            max: 45,
            colors: ['#1d4ed8', '#dc2626']
          }
        ],
        defaultVector: 'wind',
        defaultOverlay: 'temperature',
        defaultAnnotations: ['fires']
      },
      {
        id: 'ocean',
        label: '海洋',
        vectors: [],
        overlays: [
          {
            id: 'sst',
            label: '海温',
            unit: '°C',
            data: '/data/earth/ocean/sst.json',
            min: -2,
            max: 32,
            colors: ['#1d4ed8', '#dc2626']
          }
        ],
        defaultOverlay: 'sst'
      }
    ],
    annotations: [
      {
        id: 'fires',
        label: '火点',
        type: 'points',
        data: '/data/earth/annotations/fires.geojson'
      }
    ],
    weather: {
      points: '/data/weather/cities.json',
      warnings: '/data/weather/warnings.geojson',
      windFarm: '/data/weather/turbines.json'
    }
  }
}

describe('parseEarthManifest', () => {
  it('解析全部模式、矢量、叠加层与注释', () => {
    const data = parseEarthManifest(manifest())
    expect(data.modes).toHaveLength(2)
    expect(data.modes[0]?.vectors[0]?.id).toBe('wind')
    expect(data.modes[0]?.overlays[0]?.label).toBe('温度')
    expect(data.modes[0]?.overlays[0]?.colors).toHaveLength(2)
    expect(data.modes[0]?.defaultAnnotations).toEqual(['fires'])
    expect(data.annotations[0]?.id).toBe('fires')
    expect(data.weather?.points).toBe('/data/weather/cities.json')
    expect(data.range.start).toBeInstanceOf(Date)
  })

  it('缺少 modes 时抛错', () => {
    expect(() => parseEarthManifest({ range: {}, bounds })).toThrow('缺少 modes')
  })
})

describe('parseEarthScalarData', () => {
  it('解析标量帧与图例', () => {
    const data = parseEarthScalarData({
      legend: { min: 0, max: 10, unit: 'm', colors: ['#000', '#fff'] },
      frames: [
        {
          time: '2026-07-01T00:00:00Z',
          bounds,
          width: 2,
          height: 2,
          values: [0, 1, 2, 3]
        }
      ]
    })
    expect(data.frames[0]?.values).toHaveLength(4)
    expect(data.frames[0]?.time).toBeInstanceOf(Date)
    expect(data.legend.unit).toBe('m')
  })

  it('拒绝长度不匹配的帧', () => {
    expect(() =>
      parseEarthScalarData({
        frames: [
          {
            time: '2026-07-01T00:00:00Z',
            bounds,
            width: 2,
            height: 2,
            values: [1]
          }
        ]
      })
    ).toThrow('长度不匹配')
  })
})

describe('parseEarthAnnotations', () => {
  it('解析 GeoJSON 点与面', () => {
    const items = parseEarthAnnotations({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: 'fire-1', name: '火点' },
          geometry: { type: 'Point', coordinates: [110, 30] }
        },
        {
          type: 'Feature',
          properties: { id: 'coral-1', name: '珊瑚' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [100, 10],
                [110, 10],
                [110, 20],
                [100, 10]
              ]
            ]
          }
        }
      ]
    })
    expect(items).toHaveLength(2)
    expect(items[0]?.type).toBe('point')
    expect(items[1]?.type).toBe('polygon')
  })
})

describe('sampleRasterValue', () => {
  it('支持双线性与最近邻', () => {
    const values = [0, 10, 20, 30]
    expect(
      sampleRasterValue(values, 2, 2, { west: 0, south: 0, east: 10, north: 10 }, 5, 5, 'bilinear')
    ).toBe(15)
    expect(
      sampleRasterValue(values, 2, 2, { west: 0, south: 0, east: 10, north: 10 }, 5, 5, 'nearest')
    ).toBe(30)
  })
})
