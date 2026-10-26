import type * as Cesium from 'cesium'
import type { ClockService } from '../clock/ClockService'
import type { CoordService } from '../coords'
import type {
  AddDataSourceOptions,
  DataSourceInput,
  DataSourceManager
} from '../datasource/DataSourceManager'
import { DrawService } from '../draw/DrawService'
import type { EventBus } from '../events/EventBus'
import type { ImageryManager, AddImageryOptions, ImagerySource } from '../imagery/ImageryManager'
import type { PickService } from '../pick/PickService'
import type { PopupScope } from '../popup/types'
import type { PopupService } from '../popup/PopupService'
import type { LayerManager } from '../layer/LayerManager'
import type { AddTilesetOptions, TilesetManager, TilesetSource } from '../tileset/TilesetManager'
import type { CesiumKitEventMap } from '../types'
import { createId } from '../utils/assert'
import { createLogger, type Logger } from '../utils/logger'
import type {
  CesiumFeature,
  FeatureContext,
  FeatureLayerRegistry,
  PrimitiveLike
} from './types'

export interface FeatureRegistryDeps {
  viewer: Cesium.Viewer
  coords: CoordService
  events: EventBus<CesiumKitEventMap>
  imagery: ImageryManager
  pick: PickService
  clock: ClockService
  dataSources: DataSourceManager
  tilesets: TilesetManager
  popup: PopupService
  layerManager?: LayerManager
}

interface FeatureEntry {
  feature: CesiumFeature<never>
  layers: InternalLayerRegistry
  draw: DrawService
  popup: PopupScope
  cancelled: boolean
  installed: boolean
}

interface InternalLayerRegistry extends FeatureLayerRegistry {
  clear(): void
}

function createLayerRegistry(deps: FeatureRegistryDeps): InternalLayerRegistry {
  const entityIds: string[] = []
  const disposers: (() => void)[] = []
  let disposed = false
  let warned = false

  const warnDisposed = (): void => {
    if (warned) return
    warned = true
    console.warn('[cesium-kit:feature] 插件已卸载，后续登记的对象将被忽略')
  }

  const add = (entity: Cesium.Entity): Cesium.Entity => {
    if (disposed) {
      warnDisposed()
      return entity
    }
    const added = deps.viewer.entities.add(entity)
    entityIds.push(added.id)
    return added
  }

  const removeById = (id: string): void => {
    const index = entityIds.indexOf(id)
    if (index >= 0) entityIds.splice(index, 1)
    if (!deps.viewer.isDestroyed()) deps.viewer.entities.removeById(id)
  }

  return {
    get size() {
      return entityIds.length + disposers.length
    },
    add,
    addMany(entities) {
      return entities.map((entity) => add(entity))
    },
    remove(entity) {
      removeById(entity.id)
    },
    removeById,
    async imagery(source: ImagerySource, options: AddImageryOptions = {}) {
      const id = options.id ?? createId('feature-imagery')
      const layer = await deps.imagery.add(source, { ...options, id })
      if (disposed) {
        warnDisposed()
        deps.imagery.remove(id)
        return layer
      }
      disposers.push(() => deps.imagery.remove(id))
      return layer
    },
    async dataSource(input: DataSourceInput, options?: AddDataSourceOptions, name?: string) {
      const key = name ?? createId('feature-datasource')
      const dataSource = await deps.dataSources.add(key, input, options)
      if (disposed) {
        warnDisposed()
        deps.dataSources.remove(key)
        return dataSource
      }
      disposers.push(() => deps.dataSources.remove(key))
      return dataSource
    },
    async tileset(source: TilesetSource, options?: AddTilesetOptions, name?: string) {
      const key = name ?? createId('feature-tileset')
      const tileset = await deps.tilesets.add(key, source, options)
      if (disposed) {
        warnDisposed()
        deps.tilesets.remove(key)
        return tileset
      }
      disposers.push(() => deps.tilesets.remove(key))
      return tileset
    },
    primitive<T extends PrimitiveLike>(primitive: T): T {
      if (disposed) {
        warnDisposed()
        return primitive
      }
      const collection = deps.viewer.scene.primitives
      collection.add(primitive as never)
      disposers.push(() => {
        if (!deps.viewer.isDestroyed() && !collection.isDestroyed()) {
          collection.remove(primitive as never)
        }
      })
      return primitive
    },
    onDispose(disposer) {
      if (disposed) {
        warnDisposed()
        return
      }
      disposers.push(disposer)
    },
    clear() {
      if (disposed) return
      disposed = true
      for (let i = disposers.length - 1; i >= 0; i -= 1) {
        try {
          disposers[i]?.()
        } catch {
          // 清理异常不应阻断后续回收
        }
      }
      disposers.length = 0
      entityIds.slice().forEach((id) => removeById(id))
      entityIds.length = 0
    }
  }
}

/**
 * 业务插件注册表。0.1.0 仅提供扩展点，不含任何业务实现。
 */
export class FeatureRegistry {
  private entries = new Map<string, FeatureEntry>()
  private log: Logger

  constructor(
    private readonly deps: FeatureRegistryDeps,
    logger?: Logger
  ) {
    this.log = logger ?? createLogger('feature')
  }

  has(name: string): boolean {
    return this.entries.has(name)
  }

  names(): string[] {
    return Array.from(this.entries.keys())
  }

  get size(): number {
    return this.entries.size
  }

  /** 注册并安装插件。同名重复注册会抛错。 */
  async register<T>(feature: CesiumFeature<T>, options?: T): Promise<void> {
    if (!feature?.name) throw new Error('@cesium-kit/core: 插件必须有 name')
    if (this.entries.has(feature.name)) {
      throw new Error(`@cesium-kit/core: 插件 "${feature.name}" 已注册`)
    }

    const layers = createLayerRegistry(this.deps)
    const draw = new DrawService(this.deps.viewer, this.deps.coords, {
      sink: layers,
      pick: this.deps.pick,
      events: this.deps.events
    })
    const popup = this.deps.popup.createScope()
    const entry: FeatureEntry = {
      feature: feature as CesiumFeature<never>,
      layers,
      draw,
      popup,
      cancelled: false,
      installed: false
    }
    this.entries.set(feature.name, entry)

    const ctx: FeatureContext = {
      viewer: this.deps.viewer,
      clock: this.deps.clock,
      time: this.deps.clock,
      coords: this.deps.coords,
      events: this.deps.events,
      layers,
      pick: this.deps.pick,
      draw,
      popup,
      layerManager: this.deps.layerManager,
      log: createLogger(`feature:${feature.name}`)
    }

    try {
      await feature.install(ctx, options as T)
      if (entry.cancelled) {
        this.cleanup(entry)
        return
      }
      entry.installed = true
      this.deps.events.emit('feature:registered', feature.name)
    } catch (error) {
      this.entries.delete(feature.name)
      this.cleanup(entry)
      this.log.error(`插件 "${feature.name}" 安装失败`, error)
      this.deps.events.emit('feature:error', { name: feature.name, error })
      throw error
    }
  }

  /** 卸载插件并回收其所有登记对象。 */
  unregister(name: string): void {
    const entry = this.entries.get(name)
    if (!entry) return
    entry.cancelled = true
    this.entries.delete(name)
    this.cleanup(entry)
    this.deps.events.emit('feature:unregistered', name)
  }

  unregisterAll(): void {
    Array.from(this.entries.keys()).forEach((name) => this.unregister(name))
  }

  destroy(): void {
    this.unregisterAll()
  }

  private cleanup(entry: FeatureEntry): void {
    try {
      entry.feature.dispose?.()
    } catch (error) {
      this.log.error(`插件 "${entry.feature.name}" dispose 异常`, error)
    }
    entry.draw.destroy()
    entry.popup.dispose()
    entry.layers.clear()
    entry.installed = false
  }
}
