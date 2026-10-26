import * as Cesium from 'cesium'
import { describe, expect, it, vi } from 'vitest'
import { WindFarmLayer } from '../src/farm/WindFarmLayer'
import type { WindTurbine } from '../src/shared/types'

function createViewer() {
  const entities = new Map<string, Cesium.Entity>()
  const viewer = {
    entities: {
      add: (entity: Cesium.Entity) => {
        entities.set(entity.id, entity)
        return entity
      },
      remove: (entity: Cesium.Entity) => entities.delete(entity.id)
    },
    clock: {
      currentTime: Cesium.JulianDate.fromDate(new Date('2026-07-01T01:00:00Z'))
    },
    scene: { requestRender: vi.fn() },
    isDestroyed: () => false
  } as unknown as Cesium.Viewer
  return { viewer, entities }
}

const turbines: WindTurbine[] = [
  {
    id: 'wt-1',
    name: '风机 1',
    lon: 116,
    lat: 40,
    status: 'running',
    power: [
      { time: '2026-07-01T00:00:00Z', value: 1000 },
      { time: '2026-07-01T02:00:00Z', value: 2000 }
    ]
  },
  { id: 'wt-2', name: '风机 2', lon: 117, lat: 41, status: 'fault' }
]

describe('WindFarmLayer', () => {
  it('创建风机实体并支持选中高亮', () => {
    const { viewer, entities } = createViewer()
    const onSelect = vi.fn()
    const layer = new WindFarmLayer(viewer, turbines, { onSelect })

    expect(layer.size).toBe(2)
    expect(entities.size).toBe(2)

    layer.select('wt-1')
    expect(layer.selected?.id).toBe('wt-1')
    expect(onSelect).toHaveBeenCalledWith(turbines[0])
    const selected = entities.get('wind-farm:wt-1')
    expect(selected?.point?.pixelSize?.getValue()).toBeGreaterThan(9)

    layer.handlePick(entities.get('wind-farm:wt-2'))
    expect(layer.selected?.id).toBe('wt-2')

    layer.clearSelection()
    expect(layer.selected).toBeNull()
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })

  it('显隐与销毁会作用到实体', () => {
    const { viewer, entities } = createViewer()
    const layer = new WindFarmLayer(viewer, turbines)

    layer.setVisible(false)
    entities.forEach((entity) => expect(entity.show).toBe(false))

    layer.destroy()
    expect(entities.size).toBe(0)
  })
})
