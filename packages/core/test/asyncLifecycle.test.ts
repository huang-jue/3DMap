import * as Cesium from 'cesium'
import { describe, expect, it, vi } from 'vitest'
import { DataSourceManager } from '../src/datasource/DataSourceManager'
import { TilesetManager } from '../src/tileset/TilesetManager'
import { TerrainManager } from '../src/terrain/TerrainManager'
import { EventBus } from '../src/events/EventBus'
import type { CesiumKitEventMap } from '../src/types'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe.each(['datasource', 'tileset'] as const)('%s lifecycle', (kind) => {
  function harness() {
    const requests: ReturnType<typeof deferred<never>>[] = []
    const loader = vi.fn(() => {
      const request = deferred<never>()
      requests.push(request)
      return request.promise
    })
    const collection = { add: vi.fn(async (value) => value), remove: vi.fn(() => true) }
    const viewer = {
      isDestroyed: () => false,
      dataSources: collection,
      scene: { primitives: collection },
      flyTo: vi.fn(async () => true)
    } as unknown as Cesium.Viewer
    const events = new EventBus<CesiumKitEventMap>()
    const errors = vi.fn()
    events.on('error', errors)
    const manager =
      kind === 'datasource'
        ? new DataSourceManager(viewer, { geojson: loader }, undefined, events)
        : new TilesetManager(viewer, loader, undefined, events)
    const add = () =>
      kind === 'datasource'
        ? (manager as DataSourceManager).add('same', { type: 'geojson', data: '{}' })
        : (manager as TilesetManager).add('same', '/tiles.json')
    const resource = () => ({
      show: true,
      entities: { values: [] },
      maximumScreenSpaceError: 16,
      destroy: vi.fn(),
      isDestroyed: () => false
    })
    return { manager, add, collection, requests, resource, errors }
  }

  it('last request wins and disposes a late result without emitting an error', async () => {
    const h = harness()
    const first = h.add()
    const cancelled = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    const second = h.add()
    const latest = h.resource()
    h.requests[1]!.resolve(latest as never)
    await second
    const late = h.resource()
    h.requests[0]!.resolve(late as never)
    await cancelled
    expect(h.manager.get('same')).toBe(latest)
    expect(h.collection.add).toHaveBeenCalledTimes(1)
    expect(late.destroy).toHaveBeenCalledOnce()
    expect(h.errors).not.toHaveBeenCalled()
  })

  it.each(['remove', 'clear', 'destroy'] as const)(
    '%s invalidates pending loads',
    async (action) => {
      const h = harness()
      const pending = h.add()
      const cancelled = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
      if (action === 'remove') h.manager.remove('same')
      else h.manager[action]()
      const late = h.resource()
      h.requests[0]!.resolve(late as never)
      await cancelled
      expect(h.manager.size).toBe(0)
      expect(h.collection.add).not.toHaveBeenCalled()
      expect(late.destroy).toHaveBeenCalledOnce()
    }
  )

  it('reports real errors with the resource ID', async () => {
    const h = harness()
    const pending = h.add()
    const failure = expect(pending).rejects.toThrow('network')
    h.requests[0]!.reject(new Error('network'))
    await failure
    expect(h.errors).toHaveBeenCalledWith(
      expect.objectContaining({ source: kind, resourceId: 'same' })
    )
  })
})

describe('TerrainManager lifecycle', () => {
  it('does not apply an old ready event after a reset; removes listeners', async () => {
    const provider = new Cesium.EllipsoidTerrainProvider()
    const pendingProvider = deferred<Cesium.TerrainProvider>()
    const terrain = new Cesium.Terrain(pendingProvider.promise)
    const viewer = {
      scene: { terrainProvider: provider },
      isDestroyed: () => false
    } as unknown as Cesium.Viewer
    const manager = new TerrainManager(viewer)
    const pending = manager.set(terrain)
    const cancelled = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await manager.set('ellipsoid')
    pendingProvider.resolve(provider)
    await cancelled
    expect(manager.current).toBe('ellipsoid')
    expect(viewer.scene.terrainProvider).not.toBe(provider)
    expect(terrain.readyEvent.numberOfListeners).toBe(0)
    expect(terrain.errorEvent.numberOfListeners).toBe(0)
  })

  it('destroy cancels a pending terrain and rejects further changes', async () => {
    const pendingProvider = deferred<Cesium.TerrainProvider>()
    const terrain = new Cesium.Terrain(pendingProvider.promise)
    const manager = new TerrainManager({
      scene: {},
      isDestroyed: () => false
    } as unknown as Cesium.Viewer)
    const pending = manager.set(terrain)
    const cancelled = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    manager.destroy()
    await cancelled
    pendingProvider.resolve(new Cesium.EllipsoidTerrainProvider())
    await expect(manager.set('world')).rejects.toThrow('已销毁')
  })
})
