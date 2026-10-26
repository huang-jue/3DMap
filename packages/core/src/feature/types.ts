import type * as Cesium from 'cesium'
import type { ClockService } from '../clock/ClockService'
import type { CoordService } from '../coords'
import type { AddDataSourceOptions, DataSourceInput } from '../datasource/DataSourceManager'
import type { EventBus } from '../events/EventBus'
import type { CesiumKitEventMap } from '../types'
import type { DrawService } from '../draw/DrawService'
import type { AddImageryOptions, ImagerySource } from '../imagery/ImageryManager'
import type { LayerManager } from '../layer/LayerManager'
import type { PickService } from '../pick/PickService'
import type { PopupScope } from '../popup/types'
import type { AddTilesetOptions, TilesetSource } from '../tileset/TilesetManager'
import type { Logger } from '../utils/logger'

/**
 * 可与 Cesium.PrimitiveCollection 配合的自定义图元契约。
 * 只要求 Cesium 渲染循环需要的最小方法，便于插件实现自己的 Primitive。
 */
export interface PrimitiveLike {
  update(frameState: unknown): void
  isDestroyed(): boolean
  destroy(): void
  show?: boolean
}

/**
 * 插件专属的图层登记表。插件内创建的 Cesium 对象必须通过它登记，
 * 卸载时由内核统一回收，避免泄漏。
 */
export interface FeatureLayerRegistry {
  readonly size: number
  /** 添加实体并纳入自动回收 */
  add(entity: Cesium.Entity): Cesium.Entity
  addMany(entities: Cesium.Entity[]): Cesium.Entity[]
  remove(entity: Cesium.Entity): void
  removeById(id: string): void
  /** 添加底图并纳入自动回收 */
  imagery(source: ImagerySource, options?: AddImageryOptions): Promise<Cesium.ImageryLayer>
  /** 加载数据源并纳入自动回收 */
  dataSource(
    input: DataSourceInput,
    options?: AddDataSourceOptions,
    name?: string
  ): Promise<Cesium.DataSource>
  /** 加载 3D Tiles 并纳入自动回收 */
  tileset(
    source: TilesetSource,
    options?: AddTilesetOptions,
    name?: string
  ): Promise<Cesium.Cesium3DTileset>
  /** 添加自定义图元（例如风场粒子、后处理）并纳入自动回收 */
  primitive<T extends PrimitiveLike>(primitive: T): T
  /** 登记自定义清理函数（定时器、事件监听、DOM 等） */
  onDispose(disposer: () => void): void
}

/** 插件运行时上下文，由内核注入。 */
export interface FeatureContext {
  viewer: Cesium.Viewer
  /** 时间轴服务（0.2.0 起由 Cesium.Clock 升级为 ClockService） */
  clock: ClockService
  /** clock 的别名，便于阅读 */
  time: ClockService
  coords: CoordService
  events: EventBus<CesiumKitEventMap>
  layers: FeatureLayerRegistry
  /** 共享的拾取服务，插件无需自己管理事件处理器 */
  pick: PickService
  /** 插件作用域的绘制服务，卸载时自动取消并回收实体 */
  draw: DrawService
  /** 插件作用域的弹窗服务，卸载时自动关闭 */
  popup: PopupScope
  /** 可选：共享图层树，插件自管图元可通过 addCustom 接入 */
  layerManager?: LayerManager
  log: Logger
}

/** 业务插件契约。 */
export interface CesiumFeature<T = unknown> {
  name: string
  install(ctx: FeatureContext, options: T): void | Promise<void>
  /** 必须可重复调用，且同步完成 */
  dispose?(): void
}
