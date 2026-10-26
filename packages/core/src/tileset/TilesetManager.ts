import type { EventBus } from '../events/EventBus'
import type { CesiumKitEventMap } from '../types'
import { LoadGeneration, cancelledLoad, disposeResource } from '../utils/LoadGeneration'
import * as Cesium from 'cesium'
import { createLogger, type Logger } from '../utils/logger'

export type TilesetSource = string | Cesium.Resource

export interface TilesetFactoryOptions {
  maximumScreenSpaceError?: number
  shadows?: Cesium.ShadowMode | boolean
  preloadWhenHidden?: boolean
  [key: string]: unknown
}

export type TilesetFactory = (
  source: TilesetSource,
  options?: TilesetFactoryOptions
) => Promise<Cesium.Cesium3DTileset>

export interface AddTilesetOptions {
  show?: boolean
  maximumScreenSpaceError?: number
  shadows?: Cesium.ShadowMode | boolean
  preloadWhenHidden?: boolean
  /** 3D Tiles 样式，可传样式对象或 Cesium3DTileStyle */
  style?: Cesium.Cesium3DTileStyle | Record<string, unknown>
  /** 加载完成后定位到 tileset */
  flyTo?: boolean
  /** 透传给 Cesium3DTileset.fromUrl 的额外选项 */
  tilesetOptions?: Record<string, unknown>
}

export interface TilesetInfo {
  name: string
  show: boolean
  maximumScreenSpaceError: number
}

const defaultFactory: TilesetFactory = (source, options) =>
  Cesium.Cesium3DTileset.fromUrl(source as never, options as never)

function normalizeStyle(
  style: Cesium.Cesium3DTileStyle | Record<string, unknown>
): Cesium.Cesium3DTileStyle {
  return style instanceof Cesium.Cesium3DTileStyle
    ? style
    : new Cesium.Cesium3DTileStyle(style as Record<string, unknown>)
}

/**
 * 3D Tiles 管理：加载、显隐、样式、定位与销毁。
 * 工厂函数可注入，便于单测。
 */
export class TilesetManager {
  private entries = new Map<string, Cesium.Cesium3DTileset>()
  private log: Logger
  private destroyed = false
  private loads = new LoadGeneration()
  private definitions = new Map<string, { source: TilesetSource; options: AddTilesetOptions }>()

  constructor(
    private readonly viewer: Cesium.Viewer,
    private readonly factory: TilesetFactory = defaultFactory,
    logger?: Logger,
    private readonly events?: EventBus<CesiumKitEventMap>
  ) {
    this.log = logger ?? createLogger('tileset')
  }

  /** Original declarative inputs; consumers must not mutate these values. */
  definition(name: string) {
    return this.definitions.get(name)
  }

  get size(): number {
    return this.entries.size
  }

  has(name: string): boolean {
    return this.entries.has(name)
  }

  get(name: string): Cesium.Cesium3DTileset | undefined {
    return this.entries.get(name)
  }

  list(): TilesetInfo[] {
    return Array.from(this.entries.entries()).map(([name, tileset]) => ({
      name,
      show: tileset.show,
      maximumScreenSpaceError: tileset.maximumScreenSpaceError
    }))
  }

  async add(
    name: string,
    source: TilesetSource,
    options: AddTilesetOptions = {}
  ): Promise<Cesium.Cesium3DTileset> {
    this.assertAlive()
    this.remove(name)
    const token = this.loads.begin(name)
    let resource: Cesium.Cesium3DTileset | undefined
    let attached = false
    const check = (): void => {
      if (this.destroyed || this.viewer.isDestroyed() || !this.loads.current(name, token)) {
        throw cancelledLoad()
      }
    }
    try {
      const tileset = await this.factory(source, {
        maximumScreenSpaceError: options.maximumScreenSpaceError,
        shadows: options.shadows,
        preloadWhenHidden: options.preloadWhenHidden,
        ...options.tilesetOptions
      })
      resource = tileset
      check()
      tileset.show = options.show ?? true
      if (options.style) tileset.style = normalizeStyle(options.style)
      this.viewer.scene.primitives.add(tileset)
      attached = true
      this.entries.set(name, tileset)
      this.definitions.set(name, { source, options: { ...options } })
      if (options.flyTo) await this.flyTo(name)
      check()
      return tileset
    } catch (error) {
      if (resource) {
        if (this.entries.get(name) === resource) {
          this.entries.delete(name)
          this.definitions.delete(name)
        }
        if (attached && !this.viewer.isDestroyed()) this.viewer.scene.primitives.remove(resource)
        disposeResource(resource)
      }
      if (this.loads.current(name, token) && !this.destroyed && !this.viewer.isDestroyed()) {
        this.events?.emit('error', { source: 'tileset', resourceId: name, error })
      }
      throw error
    }
  }

  setStyle(name: string, style: Cesium.Cesium3DTileStyle | Record<string, unknown>): void {
    const tileset = this.entries.get(name)
    if (!tileset) {
      this.log.warn(`3D Tiles 不存在：${name}`)
      return
    }
    this.events?.emit('resource:change', { source: 'tileset', id: name, action: 'style' })
    tileset.style = normalizeStyle(style)
    const definition = this.definitions.get(name)
    if (definition) definition.options.style = style
  }

  show(name: string, visible = true): void {
    const tileset = this.entries.get(name)
    if (!tileset) return
    tileset.show = visible
  }

  /** 定位到 tileset，返回是否成功。 */
  async flyTo(name: string, duration?: number): Promise<boolean> {
    const tileset = this.entries.get(name)
    if (!tileset) return false
    return this.viewer.flyTo(tileset, duration === undefined ? undefined : { duration })
  }

  remove(name: string): boolean {
    this.loads.cancel(name)
    this.definitions.delete(name)
    const tileset = this.entries.get(name)
    if (!tileset) return false
    this.entries.delete(name)
    this.events?.emit('resource:change', { source: 'tileset', id: name, action: 'remove' })
    if (!this.viewer.isDestroyed()) {
      this.viewer.scene.primitives.remove(tileset)
    }
    return true
  }

  clear(): void {
    this.loads.clear()
    Array.from(this.entries.keys()).forEach((name) => this.remove(name))
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.loads.clear()
    this.definitions.clear()
    if (this.viewer.isDestroyed()) {
      this.entries.clear()
      return
    }
    this.clear()
  }

  private assertAlive(): void {
    if (this.destroyed || this.viewer.isDestroyed()) {
      throw new Error('@cesium-kit/core: TilesetManager 已销毁，不能再加载 3D Tiles')
    }
  }
}
