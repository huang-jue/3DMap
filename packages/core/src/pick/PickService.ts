import * as Cesium from 'cesium'
import { pickPosition } from '../coords'
import type { LonLatHeight } from '../types'
import { createLogger, type Logger } from '../utils/logger'

export type PickEventType = 'click' | 'hover'

export interface PickEventPayload {
  kind?: 'entity' | 'tiles-feature' | 'surface'
  feature?: Cesium.Cesium3DTileFeature
  position: Cesium.Cartesian3
  lonLatHeight: LonLatHeight
  screen: { x: number; y: number }
  /** 命中实体时返回（点、标签、模型、3D Tiles feature 转 entity 等） */
  entity?: Cesium.Entity
  /** 原始拾取结果，用于处理聚合标签等非 Entity 图元 */
  picked?: unknown
}

export type PickHandler = (payload: PickEventPayload) => void

/** 便于单测替换的 Cesium ScreenSpaceEventHandler 子集 */
export interface PickEventHandlerLike {
  setInputAction(action: (event: unknown) => void, type: number): void
  destroy(): void
  isDestroyed?(): boolean
}

export interface PickServiceOptions {
  /** hover 节流间隔（毫秒），默认 80 */
  hoverInterval?: number
  /** 为 false 时，未命中地表也会派发（position 取实体位置），默认 true */
  requirePosition?: boolean
  /** 自定义事件处理器工厂，用于测试 */
  createHandler?: (canvas: HTMLCanvasElement) => PickEventHandlerLike
}

function defaultHandlerFactory(canvas: HTMLCanvasElement): PickEventHandlerLike {
  return new Cesium.ScreenSpaceEventHandler(canvas) as unknown as PickEventHandlerLike
}

/**
 * 鼠标/触摸拾取服务：统一 click 与 hover，自动处理 2D/3D 差异与事件销毁。
 */
export class PickService {
  private handler: PickEventHandlerLike | null = null
  private clickHandlers = new Set<PickHandler>()
  private missHandlers = new Set<(type: PickEventType) => void>()
  private hoverHandlers = new Set<PickHandler>()
  private hoverInterval: number
  private requirePosition: boolean
  private enabled = true
  private lastHoverAt = 0
  private destroyed = false
  private log: Logger

  constructor(
    private readonly viewer: Cesium.Viewer,
    options: PickServiceOptions = {},
    logger?: Logger
  ) {
    this.hoverInterval = options.hoverInterval ?? 80
    this.requirePosition = options.requirePosition ?? true
    this.log = logger ?? createLogger('pick')
    const factory = options.createHandler ?? defaultHandlerFactory
    this.handler = factory(viewer.scene.canvas)
    this.bind()
  }

  on(type: PickEventType, handler: PickHandler): () => void {
    const set = type === 'click' ? this.clickHandlers : this.hoverHandlers
    set.add(handler)
    return () => set.delete(handler)
  }

  /** Called for sky/empty-space misses, without changing existing pick payload contracts. */
  onMiss(handler: (type: PickEventType) => void): () => void {
    this.missHandlers.add(handler)
    return () => this.missHandlers.delete(handler)
  }

  off(type: PickEventType, handler: PickHandler): void {
    const set = type === 'click' ? this.clickHandlers : this.hoverHandlers
    set.delete(handler)
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  isEnabled(): boolean {
    return this.enabled && !this.destroyed
  }

  setHoverInterval(ms: number): void {
    this.hoverInterval = Math.max(0, ms)
  }

  /** 直接拾取指定屏幕坐标（默认画布中心）。 */
  pickAt(windowPosition?: Cesium.Cartesian2): PickEventPayload | undefined {
    if (this.destroyed || this.viewer.isDestroyed()) return undefined
    const scene = this.viewer.scene
    const canvas = scene.canvas
    const screen =
      windowPosition ?? new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2)

    const picked = pickPosition(this.viewer, screen)
    const raw = scene.pick(screen)
    const pickedObject =
      raw?.id instanceof Cesium.Entity && raw.id.id.startsWith('cesium-kit-highlight-')
        ? scene
            .drillPick(screen)
            .find(
              (item: { id?: Cesium.Entity }) =>
                !(
                  item.id instanceof Cesium.Entity && item.id.id.startsWith('cesium-kit-highlight-')
                )
            )
        : raw
    const feature = pickedObject instanceof Cesium.Cesium3DTileFeature ? pickedObject : undefined
    const kind = feature
      ? ('tiles-feature' as const)
      : pickedObject?.id instanceof Cesium.Entity
        ? ('entity' as const)
        : ('surface' as const)
    const entity = pickedObject?.id instanceof Cesium.Entity ? pickedObject.id : undefined

    if (!picked) {
      const primitivePosition = (
        pickedObject?.primitive as { position?: Cesium.Cartesian3 } | undefined
      )?.position
      if (primitivePosition) {
        const carto = Cesium.Cartographic.fromCartesian(primitivePosition)
        if (carto) {
          return {
            position: primitivePosition,
            lonLatHeight: {
              lon: Cesium.Math.toDegrees(carto.longitude),
              lat: Cesium.Math.toDegrees(carto.latitude),
              height: carto.height
            },
            screen: { x: screen.x, y: screen.y },
            kind,
            feature,
            entity,
            picked: pickedObject
          }
        }
      }
      if (this.requirePosition || !entity?.position) return undefined
      const cartesian = entity.position.getValue(this.viewer.clock.currentTime)
      if (!cartesian) return undefined
      const carto = Cesium.Cartographic.fromCartesian(cartesian)
      if (!carto) return undefined
      return {
        position: cartesian,
        lonLatHeight: {
          lon: Cesium.Math.toDegrees(carto.longitude),
          lat: Cesium.Math.toDegrees(carto.latitude),
          height: carto.height
        },
        screen: { x: screen.x, y: screen.y },
        kind,
        feature,
        entity,
        picked: pickedObject
      }
    }

    return {
      position: picked.position,
      lonLatHeight: picked.lonLatHeight,
      screen: { x: screen.x, y: screen.y },
      kind,
      feature,
      entity,
      picked: pickedObject
    }
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.missHandlers.clear()
    this.clickHandlers.clear()
    this.hoverHandlers.clear()
    const handler = this.handler
    this.handler = null
    if (handler && !handler.isDestroyed?.()) {
      try {
        handler.destroy()
      } catch (error) {
        this.log.warn('销毁拾取处理器失败', error)
      }
    }
  }

  private bind(): void {
    if (!this.handler) return

    this.handler.setInputAction((event: unknown) => {
      if (!this.enabled) return
      const position = (event as { position?: Cesium.Cartesian2 }).position
      const payload = this.pickAt(position)
      if (payload) this.clickHandlers.forEach((handler) => handler(payload))
      else this.missHandlers.forEach((handler) => handler('click'))
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

    this.handler.setInputAction((event: unknown) => {
      if (!this.enabled || this.hoverHandlers.size === 0) return
      const now = Date.now()
      if (now - this.lastHoverAt < this.hoverInterval) return
      this.lastHoverAt = now
      const endPosition = (event as { endPosition?: Cesium.Cartesian2 }).endPosition
      const payload = this.pickAt(endPosition)
      if (payload) this.hoverHandlers.forEach((handler) => handler(payload))
      else this.missHandlers.forEach((handler) => handler('hover'))
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)
  }
}
