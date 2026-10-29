import * as Cesium from 'cesium'
import { describe, expect, it, vi } from 'vitest'
import { createPersistenceHarness } from './persistenceHarness'
import { validateSceneSnapshot } from '../src/snapshot/validate'

const drawings = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'point' },
      geometry: { type: 'Point', coordinates: [10, 20, 30] }
    }
  ]
}

describe('SceneSnapshotService', () => {
  it('restores extensions before the final clock/view and reports unknown or failing extensions', async () => {
    const { manager, snapshots, dispose } = createPersistenceHarness()
    const order: string[] = []
    const unregister = snapshots.registerExtension('earth', {
      capture: () => ({ mode: 'atmosphere' }),
      async restore(value) {
        expect(value).toEqual({ mode: 'atmosphere' })
        manager.clock.seek('2020-01-01')
        order.push('restore')
      },
      afterRestore() {
        expect(manager.clock.state.currentTime.toISOString()).toBe('2026-01-01T01:00:00.000Z')
        order.push('after')
      }
    })
    manager.clock.seek('2026-01-01T01:00:00Z')
    const { snapshot } = snapshots.capture()
    snapshot.extensions!.unknown = {}
    snapshot.extensions!.broken = {}
    snapshots.registerExtension('broken', {
      capture: () => null,
      restore() {
        throw new Error('missing dataset')
      }
    })
    const report = await snapshots.restore(snapshot)
    expect(order).toEqual(['restore', 'after'])
    expect(report.skipped).toContainEqual({ id: 'extension:unknown', reason: '未注册的场景扩展' })
    expect(report.failed).toContainEqual({ id: 'extension:broken', reason: 'missing dataset' })
    unregister()
    expect(snapshots.capture().snapshot.extensions).not.toHaveProperty('earth')
    const legacy = { ...snapshot }
    delete legacy.extensions
    expect((await snapshots.restore(legacy)).failed).toEqual([])
    dispose()
  })
  it('round-trips a layer tree, standalone sources, drawings, view and paused clock', async () => {
    const { manager: m, snapshots, dispose } = createPersistenceHarness()
    await m.imagery.add('local', { alpha: 0.7 })
    const group = m.layerManager.createGroup('group', { id: 'group', visible: false, alpha: 0.5 })
    await m.layerManager.addDataSource(
      'geo',
      { type: 'geojson', data: drawings },
      { parentId: group.id, id: 'geo-node' }
    )
    await m.layerManager.addTileset('city', '/tiles.json', {
      id: 'city-node',
      parentId: group.id,
      style: { color: 'color("red")' }
    })
    m.draw.importGeoJSON(drawings)
    m.clock.setRange(new Date('2026-01-01'), new Date('2026-01-02'))
    m.clock.seek('2026-01-01T01:00:00Z')
    m.clock.setMultiplier(60)
    m.clock.play()
    const { snapshot } = snapshots.capture()
    m.layerManager.setVisible(group.id, true)
    m.draw.clear()
    const report = await snapshots.restore(JSON.stringify(snapshot))
    expect(report.failed).toEqual([])
    expect(m.layerManager.tree()[0]!.visible).toBe(false)
    expect(m.layerManager.tree()[0]!.children.map((item) => item.id)).toEqual([
      'geo-node',
      'city-node'
    ])
    expect(m.tilesets.get('city')!.show).toBe(false)
    expect(m.draw.sessionList).toHaveLength(1)
    expect(m.clock.state.running).toBe(false)
    expect(m.clock.state.multiplier).toBe(60)
    expect(m.clock.state.currentTime.toISOString()).toBe('2026-01-01T01:00:00.000Z')
    await snapshots.restore(snapshot)
    expect(m.dataSources.size).toBe(1)
    expect(m.tilesets.size).toBe(1)
    expect(m.draw.sessionList).toHaveLength(1)
    dispose()
  })

  it('preflights missing references and invalid snapshots without removing existing content', async () => {
    const { manager: m, snapshots, dispose } = createPersistenceHarness()
    const source = { type: 'geojson' as const, data: 'https://example.test/data?token=secret' }
    snapshots.registerResource('private-data', { kind: 'datasource', source })
    await m.dataSources.add('private', source)
    const { snapshot } = snapshots.capture()
    expect(JSON.stringify(snapshot)).not.toContain('secret')
    snapshot.resources[0]!.resourceRef = 'missing'
    await expect(snapshots.restore(snapshot)).rejects.toThrow('资源引用缺失')
    expect(m.dataSources.has('private')).toBe(true)
    await expect(snapshots.restore({ ...snapshot, version: 2 })).rejects.toThrow('版本')
    await expect(
      snapshots.restore({
        ...snapshot,
        drawings: { type: 'FeatureCollection', features: [{ geometry: {} }] }
      })
    ).rejects.toThrow()
    expect(m.dataSources.has('private')).toBe(true)
    dispose()
  })

  it('uses a host resolver and reports failed loads while preserving unowned objects', async () => {
    const first = createPersistenceHarness()
    await first.manager.dataSources.add('good', { type: 'geojson', data: '{}' })
    await first.manager.tilesets.add('bad', '/bad.json')
    const source = new Cesium.EllipsoidTerrainProvider()
    await first.manager.terrain.set(source)
    first.snapshots.registerResource('terrain', { kind: 'terrain', source })
    const { snapshot } = first.snapshots.capture()
    const second = createPersistenceHarness()
    await second.manager.dataSources.add('good', { type: 'geojson', data: 'host' })
    const host = second.manager.dataSources.get('good')
    const entity = second.manager.viewer.entities.add(new Cesium.Entity({ name: 'host entity' }))
    second.tileFactory.mockRejectedValueOnce(new Error('missing file'))
    const resolveResource = vi.fn(async () => ({ kind: 'terrain' as const, source }))
    const report = await second.snapshots.restore(snapshot, { resolveResource })
    expect(resolveResource).toHaveBeenCalledWith('terrain', 'terrain')
    expect(report.failed).toEqual([{ id: 'tileset:bad', reason: 'missing file' }])
    expect(second.manager.dataSources.get('good')).toBe(host)
    expect(second.manager.dataSources.size).toBe(2)
    expect(second.manager.viewer.entities.contains(entity)).toBe(true)
    first.dispose()
    second.dispose()
  })

  it('reports unsupported runtime objects and supports explicit local storage', async () => {
    const { manager: m, snapshots, dispose } = createPersistenceHarness()
    await m.imagery.add({} as Cesium.ImageryProvider).catch(() => {})
    m.viewer.entities.add(new Cesium.Entity({ name: 'runtime', point: {} }))
    await m.layerManager.createEntityGroup('runtime group')
    m.draw.importGeoJSON(drawings)
    const result = snapshots.saveLocal('test-scene')
    expect(result.skipped.map((item) => item.id)).toContain('entities')
    m.draw.clear()
    await snapshots.restoreLocal('test-scene')
    expect(m.draw.sessionList).toHaveLength(1)
    localStorage.removeItem('test-scene')
    dispose()
  })

  it('rejects invalid resource references, malformed dates and duplicate IDs', () => {
    const { snapshots, dispose } = createPersistenceHarness()
    const { snapshot } = snapshots.capture()
    expect(() =>
      validateSceneSnapshot({ ...snapshot, clock: { ...snapshot.clock, currentTime: 'bad' } })
    ).toThrow('时钟')
    const node = {
      id: 'duplicate',
      kind: 'group',
      name: 'g',
      visible: true,
      alpha: 1,
      children: []
    }
    expect(() => validateSceneSnapshot({ ...snapshot, layers: [node, node] })).toThrow('重复')
    expect(() =>
      validateSceneSnapshot({
        ...snapshot,
        layers: [{ ...node, kind: 'tileset', resourceId: 'missing' }]
      })
    ).toThrow('资源引用')
    dispose()
  })
})
