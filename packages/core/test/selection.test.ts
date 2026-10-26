import * as Cesium from 'cesium'
import { describe, expect, it, vi } from 'vitest'
import { SelectionService } from '../src/selection/SelectionService'
import { createPersistenceHarness } from './persistenceHarness'

describe('SelectionService', () => {
  it('reads properties, highlights and restores entities without modifying original graphics', () => {
    const h = createPersistenceHarness()
    const service = new SelectionService(h.manager)
    const entity = h.manager.viewer.entities.add(
      new Cesium.Entity({
        id: 'point',
        name: 'test',
        point: { color: Cesium.Color.RED },
        properties: { answer: 42 }
      })
    )
    const original = entity.point!.color
    const listener = vi.fn()
    service.onChange(listener)
    h.handlers.get('click')!(h.payload(entity))
    expect(service.state.selected!.properties.answer).toBe(42)
    expect(h.manager.viewer.entities.values).toHaveLength(2)
    expect(entity.point!.color).toBe(original)
    service.clear()
    expect(h.manager.viewer.entities.values).toHaveLength(1)
    expect(listener).toHaveBeenLastCalledWith({ selected: null, hovered: null })
    service.destroy()
    h.dispose()
  })

  it('clears hover on misses and selection on removal or drawing; respects pick suspension', () => {
    const h = createPersistenceHarness()
    const service = new SelectionService(h.manager)
    const entity = h.manager.viewer.entities.add(new Cesium.Entity({ point: {} }))
    h.handlers.get('hover')!(h.payload(entity))
    expect(service.state.hovered).toBeTruthy()
    h.miss('hover')
    expect(service.state.hovered).toBeNull()
    service.select(h.payload(entity))
    h.manager.viewer.entities.remove(entity)
    h.manager.viewer.scene.preRender.raiseEvent()
    expect(service.state.selected).toBeNull()
    h.manager.pick.setEnabled(false)
    expect(service.select(h.payload(entity))).toBeNull()
    service.destroy()
    h.dispose()
  })

  it('reads Tiles properties, restores color and clears before a style change or layer removal', async () => {
    const h = createPersistenceHarness()
    const service = new SelectionService(h.manager)
    await h.manager.layerManager.addTileset('tiles', '/tiles.json', { id: 'tiles-node' })
    const tileset = h.manager.tilesets.get('tiles')!
    const feature = {
      tileset,
      color: Cesium.Color.RED.clone(),
      getPropertyIds: () => ['id', 'name'],
      getProperty: (key: string) => (key === 'id' ? 17 : 'building')
    } as unknown as Cesium.Cesium3DTileFeature
    service.select(h.payload(undefined, feature))
    expect(service.state.selected).toMatchObject({
      kind: 'tiles-feature',
      id: 17,
      layerId: 'tiles-node',
      properties: { name: 'building' }
    })
    expect(feature.color).toEqual(Cesium.Color.YELLOW)
    h.manager.tilesets.setStyle('tiles', { color: 'color("blue")' })
    expect(service.state.selected).toBeNull()
    expect(feature.color).toEqual(Cesium.Color.RED)
    service.select(h.payload(undefined, feature))
    h.manager.layerManager.remove('tiles-node')
    expect(service.state.selected).toBeNull()
    service.destroy()
    h.dispose()
  })
})
