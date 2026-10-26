import * as Cesium from 'cesium'
import { describe, expect, it, vi } from 'vitest'
import { EventBus } from '../src/events/EventBus'
import { FeatureRegistry, type FeatureRegistryDeps } from '../src/feature/FeatureRegistry'
import type { CesiumFeature, FeatureContext, PrimitiveLike } from '../src/feature/types'
import type { CesiumKitEventMap } from '../src/types'

interface Harness {
  deps: FeatureRegistryDeps
  entities: Map<string, Cesium.Entity>
  primitives: Set<PrimitiveLike>
  imagery: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }
  dataSources: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }
  tilesets: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }
  events: EventBus<CesiumKitEventMap>
}

function createHarness(): Harness {
  const entities = new Map<string, Cesium.Entity>()
  const primitives = new Set<PrimitiveLike>()
  let seq = 0

  const viewer = {
    entities: {
      add: (entity: Cesium.Entity) => {
        const id = entity.id || `entity-${++seq}`
        const stored = entity.id ? entity : new Cesium.Entity({ id })
        entities.set(id, stored)
        return stored
      },
      removeById: (id: string) => entities.delete(id),
      values: [],
      getById: (id: string) => entities.get(id)
    },
    scene: {
      primitives: {
        add: (primitive: PrimitiveLike) => {
          primitives.add(primitive)
          return primitive
        },
        remove: (primitive: PrimitiveLike) => primitives.delete(primitive),
        isDestroyed: () => false
      }
    },
    isDestroyed: () => false,
    clock: {} as Cesium.Clock
  } as unknown as Cesium.Viewer

  const imagery = {
    add: vi.fn(async () => ({}) as Cesium.ImageryLayer),
    remove: vi.fn()
  }

  const dataSources = {
    add: vi.fn(async () => ({ entities: { values: [] } }) as unknown as Cesium.DataSource),
    remove: vi.fn()
  }

  const tilesets = {
    add: vi.fn(async () => ({}) as Cesium.Cesium3DTileset),
    remove: vi.fn()
  }

  const events = new EventBus<CesiumKitEventMap>()
  const popup = {
    createScope: () => ({
      size: 0,
      open: vi.fn(),
      close: vi.fn(),
      closeAll: vi.fn(),
      dispose: vi.fn()
    })
  }
  return {
    deps: {
      viewer,
      coords: {} as FeatureRegistryDeps['coords'],
      events,
      imagery: imagery as unknown as FeatureRegistryDeps['imagery'],
      pick: {} as FeatureRegistryDeps['pick'],
      clock: {} as FeatureRegistryDeps['clock'],
      dataSources: dataSources as unknown as FeatureRegistryDeps['dataSources'],
      tilesets: tilesets as unknown as FeatureRegistryDeps['tilesets'],
      popup: popup as unknown as FeatureRegistryDeps['popup']
    },
    entities,
    primitives,
    imagery,
    dataSources,
    tilesets,
    events
  }
}

function markerFeature(onInstall?: (ctx: FeatureContext) => void): CesiumFeature<{ count: number }> {
  return {
    name: 'markers',
    install(ctx, options) {
      for (let i = 0; i < (options?.count ?? 1); i += 1) {
        ctx.layers.add(new Cesium.Entity({ id: `m-${i}` }))
      }
      onInstall?.(ctx)
    },
    dispose: vi.fn()
  }
}

describe('FeatureRegistry', () => {
  it('注册时登记实体，卸载时全部清理', async () => {
    const { deps, entities, events } = createHarness()
    const registry = new FeatureRegistry(deps)
    const feature = markerFeature()

    await registry.register(feature, { count: 3 })
    expect(entities.size).toBe(3)
    expect(registry.names()).toEqual(['markers'])
    expect(events.listenerCount('feature:registered')).toBe(0)

    registry.unregister('markers')
    expect(entities.size).toBe(0)
    expect(feature.dispose).toHaveBeenCalledTimes(1)
    expect(registry.size).toBe(0)
  })

  it('同名插件重复注册会抛错', async () => {
    const { deps } = createHarness()
    const registry = new FeatureRegistry(deps)
    await registry.register(markerFeature())
    await expect(registry.register(markerFeature())).rejects.toThrow('已注册')
  })

  it('安装失败时回滚并移除条目', async () => {
    const { deps, entities } = createHarness()
    const events = deps.events
    const errors: unknown[] = []
    events.on('feature:error', ({ error }) => errors.push(error))

    const registry = new FeatureRegistry(deps)
    const feature: CesiumFeature = {
      name: 'broken',
      install(ctx) {
        ctx.layers.add(new Cesium.Entity({ id: 'leak' }))
        throw new Error('install failed')
      }
    }

    await expect(registry.register(feature)).rejects.toThrow('install failed')
    expect(entities.size).toBe(0)
    expect(registry.has('broken')).toBe(false)
    expect(errors).toHaveLength(1)
  })

  it('onDispose 在卸载时逆序执行', async () => {
    const { deps } = createHarness()
    const registry = new FeatureRegistry(deps)
    const order: string[] = []

    await registry.register({
      name: 'timers',
      install(ctx) {
        ctx.layers.onDispose(() => order.push('first'))
        ctx.layers.onDispose(() => order.push('second'))
      }
    })

    registry.unregister('timers')
    expect(order).toEqual(['second', 'first'])
  })

  it('安装过程中被卸载不会留下实体', async () => {
    const { deps, entities } = createHarness()
    const registry = new FeatureRegistry(deps)
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    const registering = registry.register({
      name: 'slow',
      async install(ctx) {
        await gate
        ctx.layers.add(new Cesium.Entity({ id: 'late' }))
      }
    })

    registry.unregister('slow')
    release()
    await registering

    expect(entities.size).toBe(0)
    expect(registry.has('slow')).toBe(false)
  })

  it('底图图层卸载时自动移除', async () => {
    const { deps, imagery } = createHarness()
    const registry = new FeatureRegistry(deps)

    await registry.register({
      name: 'imagery-plugin',
      async install(ctx) {
        await ctx.layers.imagery('osm', { id: 'plugin-osm' })
      }
    })
    expect(imagery.add).toHaveBeenCalledTimes(1)

    registry.unregister('imagery-plugin')
    expect(imagery.remove).toHaveBeenCalledWith('plugin-osm')
  })

  it('插件可访问共享拾取服务', async () => {
    const { deps } = createHarness()
    const registry = new FeatureRegistry(deps)
    let received: unknown = null

    await registry.register({
      name: 'pick-user',
      install(ctx) {
        received = ctx.pick
      }
    })

    expect(received).toBe(deps.pick)
  })

  it('数据源与 3D Tiles 在卸载时自动清理', async () => {
    const { deps, dataSources, tilesets } = createHarness()
    const registry = new FeatureRegistry(deps)

    await registry.register({
      name: 'layers-plugin',
      async install(ctx) {
        await ctx.layers.dataSource({ type: 'geojson', data: '{}' }, undefined, 'plugin-geo')
        await ctx.layers.tileset('/tiles/tileset.json', undefined, 'plugin-tiles')
      }
    })

    expect(dataSources.add).toHaveBeenCalledOnce()
    expect(tilesets.add).toHaveBeenCalledOnce()

    registry.unregister('layers-plugin')

    expect(dataSources.remove).toHaveBeenCalledWith('plugin-geo')
    expect(tilesets.remove).toHaveBeenCalledWith('plugin-tiles')
  })

  it('时间轴与 time 指向同一实例', async () => {
    const { deps } = createHarness()
    const registry = new FeatureRegistry(deps)
    let same = false

    await registry.register({
      name: 'time-user',
      install(ctx) {
        same = ctx.clock === ctx.time && ctx.clock === deps.clock
      }
    })

    expect(same).toBe(true)
  })

  it('自定义图元登记并在卸载时移除', async () => {
    const { deps, primitives } = createHarness()
    const registry = new FeatureRegistry(deps)
    const primitive = {
      update: vi.fn(),
      isDestroyed: () => false,
      destroy: vi.fn()
    }

    await registry.register({
      name: 'primitive-plugin',
      install(ctx) {
        ctx.layers.primitive(primitive)
      }
    })

    expect(primitives.size).toBe(1)

    registry.unregister('primitive-plugin')
    expect(primitives.size).toBe(0)
  })
})
