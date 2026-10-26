import type * as Cesium from 'cesium'
import { describe, expect, it, vi } from 'vitest'
import { EventBus } from '../src/events/EventBus'
import { ImageryManager } from '../src/imagery/ImageryManager'
import type { CesiumKitEventMap } from '../src/types'

interface FakeLayer {
  show: boolean
  alpha: number
  provider: unknown
}

function createHarness() {
  const layers: FakeLayer[] = []
  let destroyed = false

  const viewer = {
    imageryLayers: {
      addImageryProvider: vi.fn((provider: unknown) => {
        const layer: FakeLayer = { show: true, alpha: 1, provider }
        layers.push(layer)
        return layer
      }),
      remove: vi.fn((layer: FakeLayer) => {
        const index = layers.indexOf(layer)
        if (index >= 0) layers.splice(index, 1)
      })
    },
    isDestroyed: () => destroyed
  } as unknown as Cesium.Viewer

  const events = new EventBus<CesiumKitEventMap>()
  const manager = new ImageryManager(viewer, events)

  return {
    manager,
    layers,
    events,
    viewer,
    markDestroyed: () => {
      destroyed = true
    }
  }
}

const provider = (name: string) =>
  ({ requestImage: () => name }) as unknown as Cesium.ImageryProvider

describe('ImageryManager', () => {
  it('添加、列出与激活状态', async () => {
    const { manager, layers } = createHarness()

    await manager.add(provider('a'), { id: 'a' })
    await manager.add(provider('b'), { id: 'b', show: false })

    expect(layers).toHaveLength(2)
    expect(manager.size).toBe(2)
    expect(manager.active).toBe('a')
    expect(manager.list().map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('重复 id 会先移除旧图层', async () => {
    const { manager, viewer, layers } = createHarness()

    await manager.add(provider('a'), { id: 'dup' })
    await manager.add(provider('b'), { id: 'dup' })

    expect(viewer.imageryLayers.remove).toHaveBeenCalledTimes(1)
    expect(layers).toHaveLength(1)
  })

  it('switchTo 只显示指定底图', async () => {
    const { manager, layers, events } = createHarness()
    const listener = vi.fn()
    events.on('imagery:change', listener)

    await manager.add(provider('a'), { id: 'a' })
    await manager.add(provider('b'), { id: 'b' })
    manager.switchTo('b')

    expect(layers.map((layer) => layer.show)).toEqual([false, true])
    expect(manager.active).toBe('b')
    expect(listener).toHaveBeenLastCalledWith({ id: 'b' })
  })

  it('未知底图只告警不抛错', () => {
    const { manager } = createHarness()
    expect(() => manager.switchTo('missing')).not.toThrow()
  })

  it('setAlpha 会夹取范围并派发 imagery:update', async () => {
    const { manager, layers, events } = createHarness()
    const listener = vi.fn()
    events.on('imagery:update', listener)

    await manager.add(provider('a'), { id: 'a' })
    manager.setAlpha('a', 3)
    expect(layers[0].alpha).toBe(1)

    manager.setAlpha('a', -1)
    expect(layers[0].alpha).toBe(0)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('destroy 后操作抛出可读错误', async () => {
    const { manager } = createHarness()
    await manager.add(provider('a'), { id: 'a' })
    manager.destroy()

    expect(() => manager.switchTo('a')).toThrow('已销毁')
    await expect(manager.add(provider('b'), { id: 'b' })).rejects.toThrow('已销毁')
  })

  it('destroy 幂等且移除所有图层', async () => {
    const { manager, layers } = createHarness()
    await manager.add(provider('a'), { id: 'a' })
    manager.destroy()
    manager.destroy()

    expect(layers).toHaveLength(0)
    expect(manager.size).toBe(0)
  })

  it('addMany 按顺序叠加', async () => {
    const { manager } = createHarness()
    await manager.addMany([
      { source: provider('a'), id: 'a' },
      { source: provider('b'), id: 'b', show: false }
    ])

    expect(manager.list().map((item) => item.id)).toEqual(['a', 'b'])
  })
})
