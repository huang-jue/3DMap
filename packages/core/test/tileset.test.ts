import * as Cesium from 'cesium'
import { describe, expect, it, vi } from 'vitest'
import { TilesetManager, type TilesetFactory } from '../src/tileset/TilesetManager'

function createHarness() {
  const created: Array<{ show: boolean; maximumScreenSpaceError: number; style: unknown }> = []
  const factory: TilesetFactory = vi.fn(async () => {
    const tileset = {
      show: true,
      maximumScreenSpaceError: 16,
      style: null as unknown
    }
    created.push(tileset)
    return tileset as unknown as Cesium.Cesium3DTileset
  })

  const primitives = {
    add: vi.fn(),
    remove: vi.fn()
  }

  const viewer = {
    scene: { primitives },
    flyTo: vi.fn(async () => true),
    isDestroyed: () => false
  } as unknown as Cesium.Viewer

  const manager = new TilesetManager(viewer, factory)
  return { manager, viewer, factory, primitives, created }
}

describe('TilesetManager', () => {
  it('加载后加入 primitives 并登记', async () => {
    const { manager, primitives, created } = createHarness()

    await manager.add('city', '/tiles/tileset.json', { maximumScreenSpaceError: 8 })

    expect(primitives.add).toHaveBeenCalledOnce()
    expect(manager.size).toBe(1)
    expect(manager.get('city')).toBe(created[0])
    expect(manager.list()[0]?.name).toBe('city')
  })

  it('支持样式与显隐', async () => {
    const { manager, created } = createHarness()
    await manager.add('city', '/tiles/tileset.json', {
      style: { color: 'color("red")' },
      show: false
    })

    expect(created[0]?.style).toBeInstanceOf(Cesium.Cesium3DTileStyle)
    expect(created[0]?.show).toBe(false)

    manager.show('city', true)
    expect(created[0]?.show).toBe(true)

    manager.setStyle('city', new Cesium.Cesium3DTileStyle({ show: 'true' }))
    expect(created[0]?.style).toBeInstanceOf(Cesium.Cesium3DTileStyle)
  })

  it('flyTo 调用 viewer.flyTo', async () => {
    const { manager, viewer } = createHarness()
    await manager.add('city', '/tiles/tileset.json')

    await manager.flyTo('city', 2)

    expect(viewer.flyTo).toHaveBeenCalledOnce()
    expect(await manager.flyTo('missing')).toBe(false)
  })

  it('remove 从 primitives 移除', async () => {
    const { manager, primitives } = createHarness()
    await manager.add('city', '/tiles/tileset.json')

    expect(manager.remove('city')).toBe(true)
    expect(primitives.remove).toHaveBeenCalledOnce()
    expect(manager.size).toBe(0)
    expect(manager.remove('city')).toBe(false)
  })

  it('同名重复加载会先移除旧的', async () => {
    const { manager, primitives } = createHarness()
    await manager.add('city', '/a.json')
    await manager.add('city', '/b.json')

    expect(primitives.remove).toHaveBeenCalledTimes(1)
    expect(manager.size).toBe(1)
  })

  it('destroy 后拒绝继续加载', async () => {
    const { manager } = createHarness()
    manager.destroy()
    await expect(manager.add('x', '/tiles.json')).rejects.toThrow('已销毁')
  })
})
