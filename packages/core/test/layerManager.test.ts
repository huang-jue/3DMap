import * as Cesium from 'cesium'
import { describe, expect, it, vi } from 'vitest'
import { EventBus } from '../src/events/EventBus'
import { LayerManager, type LayerManagerDeps } from '../src/layer/LayerManager'
import type { CesiumKitEventMap } from '../src/types'

interface Harness {
  manager: LayerManager
  viewer: {
    imageryLayers: { raiseToTop: ReturnType<typeof vi.fn> }
    dataSources: {
      add: ReturnType<typeof vi.fn>
      remove: ReturnType<typeof vi.fn>
      raiseToTop: ReturnType<typeof vi.fn>
    }
    scene: {
      primitives: { raiseToTop: ReturnType<typeof vi.fn> }
      requestRender: ReturnType<typeof vi.fn>
    }
  }
  imagery: {
    add: ReturnType<typeof vi.fn>
    get: (id: string) => { show: boolean; alpha: number } | undefined
    remove: ReturnType<typeof vi.fn>
  }
  dataSources: {
    add: ReturnType<typeof vi.fn>
    get: (name: string) => { show: boolean; entities: { values: unknown[] } } | undefined
    remove: ReturnType<typeof vi.fn>
  }
  tilesets: {
    add: ReturnType<typeof vi.fn>
    get: (name: string) => { show: boolean } | undefined
    remove: ReturnType<typeof vi.fn>
  }
  events: EventBus<CesiumKitEventMap>
}

function createHarness(): Harness {
  const imageryLayers = new Map<string, { show: boolean; alpha: number }>()
  const imagery = {
    add: vi.fn(
      async (_source: unknown, options: { id: string; show?: boolean; alpha?: number }) => {
        const layer = { show: options.show ?? true, alpha: options.alpha ?? 1 }
        imageryLayers.set(options.id, layer)
        return layer
      }
    ),
    get: (id: string) => imageryLayers.get(id),
    remove: vi.fn((id: string) => {
      imageryLayers.delete(id)
    })
  }

  const dataSourceLayers = new Map<string, { show: boolean; entities: { values: unknown[] } }>()
  const dataSources = {
    add: vi.fn(async (name: string) => {
      const dataSource = { show: true, entities: { values: [] } }
      dataSourceLayers.set(name, dataSource)
      return dataSource
    }),
    get: (name: string) => dataSourceLayers.get(name),
    remove: vi.fn((name: string) => {
      dataSourceLayers.delete(name)
    })
  }

  const tilesetLayers = new Map<string, { show: boolean }>()
  const tilesets = {
    add: vi.fn(async (name: string) => {
      const tileset = { show: true }
      tilesetLayers.set(name, tileset)
      return tileset
    }),
    get: (name: string) => tilesetLayers.get(name),
    remove: vi.fn((name: string) => {
      tilesetLayers.delete(name)
    })
  }

  const viewer = {
    imageryLayers: { raiseToTop: vi.fn() },
    dataSources: {
      add: vi.fn((source: unknown) => Promise.resolve(source)),
      remove: vi.fn(() => true),
      raiseToTop: vi.fn()
    },
    scene: {
      primitives: { raiseToTop: vi.fn() },
      requestRender: vi.fn()
    },
    isDestroyed: () => false
  }

  const events = new EventBus<CesiumKitEventMap>()
  const manager = new LayerManager({
    viewer: viewer as unknown as Cesium.Viewer,
    imagery: imagery as unknown as LayerManagerDeps['imagery'],
    dataSources: dataSources as unknown as LayerManagerDeps['dataSources'],
    tilesets: tilesets as unknown as LayerManagerDeps['tilesets'],
    events
  })

  return { manager, viewer, imagery, dataSources, tilesets, events }
}

describe('LayerManager', () => {
  it('创建分组并添加数据源图层', async () => {
    const { manager, events } = createHarness()
    const group = manager.createGroup('业务图层')
    const node = await manager.addDataSource(
      'rivers',
      { type: 'geojson', data: '{}' },
      { parentId: group.id }
    )

    expect(node.parentId).toBe(group.id)
    expect(node.kind).toBe('datasource')
    expect(manager.tree()[0]?.children[0]?.id).toBe('rivers')
    expect(events.listenerCount('layer:change')).toBe(0)
  })

  it('分组显隐级联到叶子', async () => {
    const { manager, dataSources } = createHarness()
    const group = manager.createGroup('业务图层')
    await manager.addDataSource('rivers', { type: 'geojson', data: '{}' }, { parentId: group.id })

    manager.setVisible(group.id, false)
    expect(dataSources.get('rivers')?.show).toBe(false)

    manager.setVisible(group.id, true)
    expect(dataSources.get('rivers')?.show).toBe(true)
  })

  it('底图透明度沿分组链路相乘', async () => {
    const { manager, imagery } = createHarness()
    const group = manager.createGroup('底图组')
    group.alpha = 0.5
    manager.setAlpha(group.id, 0.5)
    const node = await manager.addImagery('osm', { parentId: group.id, alpha: 0.5 })

    expect(node.kind).toBe('imagery')
    expect(imagery.get(node.sourceId ?? '')?.alpha).toBeCloseTo(0.25)
  })

  it('排序调用对应集合的 raiseToTop', async () => {
    const { manager, viewer } = createHarness()
    await manager.addDataSource('a', { type: 'geojson', data: '{}' })
    await manager.addDataSource('b', { type: 'geojson', data: '{}' })
    manager.move('a', 'root', 0)

    expect(viewer.dataSources.raiseToTop).toHaveBeenCalled()
  })

  it('删除分组时递归移除子图层与数据源', async () => {
    const { manager, dataSources } = createHarness()
    const group = manager.createGroup('业务图层')
    await manager.addDataSource('rivers', { type: 'geojson', data: '{}' }, { parentId: group.id })

    manager.remove(group.id)
    expect(manager.tree()).toHaveLength(0)
    expect(dataSources.remove).toHaveBeenCalledWith('rivers')
  })

  it('创建实体组并加入数据源集合', async () => {
    const { manager, viewer } = createHarness()
    const group = await manager.createEntityGroup('城市标注', {
      clustering: { pixelRange: 80, minimumClusterSize: 3 }
    })
    group.add(new Cesium.Entity({ id: 'city-1' }))

    expect(group.count).toBe(1)
    expect(group.dataSource.clustering.pixelRange).toBe(80)
    expect(viewer.dataSources.add).toHaveBeenCalledTimes(1)
    expect(manager.getEntityGroup(group.id)).toBe(group)
  })

  it('销毁时清空树与来源', async () => {
    const { manager, dataSources } = createHarness()
    await manager.addDataSource('rivers', { type: 'geojson', data: '{}' })
    manager.destroy()

    expect(manager.tree()).toHaveLength(0)
    expect(dataSources.remove).toHaveBeenCalledWith('rivers')
    expect(() => manager.createGroup('x')).toThrow('已销毁')
  })
})

it.each(['clear', 'destroy'] as const)(
  'does not insert a pending layer after %s',
  async (action) => {
    const { manager, dataSources } = createHarness()
    let finish!: () => void
    dataSources.add.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    const pending = manager.addDataSource('late', { type: 'geojson', data: '{}' })
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    manager[action]()
    finish()
    await rejected
    expect(manager.tree()).toEqual([])
    expect(dataSources.remove).toHaveBeenCalledWith('late')
  }
)
