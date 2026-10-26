import * as Cesium from 'cesium'
import { describe, expect, it, vi } from 'vitest'
import { WeatherPointLayer } from '../src/layers/WeatherPointLayer'
import { WeatherWarningLayer, warningCenter } from '../src/layers/WeatherWarningLayer'
import type { WeatherPointForecast, WeatherWarning } from '../src/shared/types'

function createViewer() {
  const entities = new Map<string, Cesium.Entity>()
  const viewer = {
    entities: {
      add: vi.fn((entity: Cesium.Entity) => {
        entities.set(entity.id, entity)
        return entity
      }),
      remove: vi.fn((entity: Cesium.Entity) => {
        entities.delete(entity.id)
        return true
      })
    },
    scene: { requestRender: vi.fn() },
    isDestroyed: () => false
  }
  return { viewer: viewer as unknown as Cesium.Viewer, entities }
}

const points: WeatherPointForecast[] = [
  {
    id: 'wuhan',
    name: '武汉',
    lon: 114.3,
    lat: 30.6,
    hourly: [{ time: new Date('2026-07-01T00:00:00Z'), temperature: 30 }]
  },
  {
    id: 'beijing',
    name: '北京',
    lon: 116.4,
    lat: 39.9,
    hourly: []
  }
]

const warnings: WeatherWarning[] = [
  {
    id: 'w1',
    type: '暴雨',
    level: 'yellow',
    title: '暴雨黄色预警',
    startTime: new Date('2026-07-01T00:00:00Z'),
    endTime: new Date('2026-07-01T12:00:00Z'),
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [112, 29],
          [116, 29],
          [116, 32],
          [112, 32],
          [112, 29]
        ]
      ]
    }
  }
]

describe('WeatherPointLayer', () => {
  it('创建点、选中与显隐', () => {
    const { viewer, entities } = createViewer()
    const onSelect = vi.fn()
    const layer = new WeatherPointLayer(viewer, points, { onSelect })

    expect(layer.size).toBe(2)
    expect(entities.size).toBe(2)

    const entity = entities.get('weather-point:wuhan')
    expect(entity).toBeTruthy()
    layer.handlePick(entity)
    expect(onSelect).toHaveBeenCalledWith(points[0])
    expect(layer.selected?.id).toBe('wuhan')

    layer.setVisible(false)
    expect(entity?.show).toBe(false)

    layer.destroy()
    expect(entities.size).toBe(0)
  })
})

describe('WeatherWarningLayer', () => {
  it('按时间显隐并响应拾取', () => {
    const { viewer, entities } = createViewer()
    const onSelect = vi.fn()
    const layer = new WeatherWarningLayer(viewer, warnings, { onSelect })

    expect(layer.size).toBe(1)
    expect(entities.size).toBe(2)

    layer.setTime(new Date('2026-07-01T06:00:00Z'))
    expect(entities.get('weather-warning:w1:0')?.show).toBe(true)

    layer.setTime(new Date('2026-07-01T18:00:00Z'))
    expect(entities.get('weather-warning:w1:0')?.show).toBe(false)

    layer.handlePick(entities.get('weather-warning:w1:0'))
    expect(onSelect).toHaveBeenCalledWith(warnings[0])

    expect(warningCenter(warnings[0]!)).toEqual({ lon: 114, lat: 30.5 })
    layer.destroy()
    expect(entities.size).toBe(0)
  })
})
