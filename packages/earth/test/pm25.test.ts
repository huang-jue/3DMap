import { describe, expect, it } from 'vitest'
import * as Cesium from 'cesium'
import { EarthScalarLayer } from '../src/layers/EarthScalarLayer'
import { parseEarthManifest } from '../src/data/parseEarthManifest'

describe('concentration color scale', () => {
  it('uses logarithmic mapping and clamps values below/above the color range', () => {
    const layer = new EarthScalarLayer(
      {} as Cesium.Viewer,
      {
        legend: { min: 1, max: 1000, unit: 'µg/m³', colors: ['#000000', '#ffffff'] },
        frames: [
          {
            time: new Date(),
            width: 2,
            height: 2,
            bounds: { west: -180, south: -90, east: 180, north: 90 },
            values: [0, 10, 100, 1000]
          }
        ]
      },
      { scale: 'log' }
    )
    expect(layer.colorAt(0)).toBe('rgba(0, 0, 0, 1)')
    expect(layer.colorAt(10)).toBe('rgba(85, 85, 85, 1)')
    expect(layer.colorAt(100)).toBe('rgba(170, 170, 170, 1)')
    expect(layer.colorAt(10000)).toBe('rgba(255, 255, 255, 1)')
  })

  it('preserves per-overlay source/grid/times rather than inheriting GFS metadata', () => {
    const parsed = parseEarthManifest({
      range: { start: '2026-10-27T01:00Z', end: '2026-10-27T06:00Z' },
      bounds: { west: -180, south: -90, east: 180, north: 90 },
      modes: [
        {
          id: 'particulate',
          overlays: [
            {
              id: 'pm25',
              scale: 'log',
              metadata: {
                source: 'CAMS',
                resolution: 0.4,
                width: 901,
                height: 451,
                level: 'surface',
                times: ['2026-10-27T03:00Z']
              }
            }
          ]
        }
      ]
    })
    expect(parsed.modes[0]?.overlays[0]?.metadata).toEqual({
      source: 'CAMS',
      resolution: 0.4,
      width: 901,
      height: 451,
      level: 'surface',
      times: ['2026-10-27T03:00Z']
    })
  })
})
