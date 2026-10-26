import * as Cesium from 'cesium'
import type { EventBus } from '../events/EventBus'
import type { CesiumKitEventMap } from '../types'
import { createLogger, type Logger } from '../utils/logger'
import { imageryPresets, type ImageryPreset } from './presets'
import { LoadGeneration, cancelledLoad } from '../utils/LoadGeneration'

export type ImageryProviderInput =
  | Cesium.ImageryProvider
  | Promise<Cesium.ImageryProvider>
  | (() => Cesium.ImageryProvider | Promise<Cesium.ImageryProvider>)

/** 底图来源：预设 id、provider、异步 provider 或工厂函数。 */
export type ImagerySource = string | ImageryProviderInput

export interface AddImageryOptions {
  /** 图层唯一 id，默认取预设 id 或自动生成 */
  id?: string
  show?: boolean
  alpha?: number
  /** 插入位置，0 表示最底层 */
  index?: number
}

export interface ImageryLayerInfo {
  id: string
  label: string
  show: boolean
  alpha: number
}

interface ImageryEntry {
  id: string
  label: string
  layer: Cesium.ImageryLayer
}

function isImageryProvider(value: unknown): value is Cesium.ImageryProvider {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Cesium.ImageryProvider).requestImage === 'function'
  )
}

function isPromiseLike(value: unknown): value is Promise<Cesium.ImageryProvider> {
  return typeof (value as Promise<Cesium.ImageryProvider>)?.then === 'function'
}

export class ImageryManager {
  private entries = new Map<string, ImageryEntry>()
  private definitions = new Map<string, ImagerySource>()

  definition(id: string): ImagerySource | undefined {
    return this.definitions.get(id)
  }

  private activeId: string | null = null
  private log: Logger
  private seq = 0
  private destroyed = false
  private loads = new LoadGeneration()

  constructor(
    private readonly viewer: Cesium.Viewer,
    private readonly events: EventBus<CesiumKitEventMap>,
    private readonly presets: Record<string, ImageryPreset> = imageryPresets,
    logger?: Logger
  ) {
    this.log = logger ?? createLogger('imagery')
  }

  isDestroyed(): boolean {
    return this.destroyed
  }

  private assertAlive(): void {
    if (this.destroyed || this.viewer.isDestroyed()) {
      throw new Error('@cesium-kit/core: ImageryManager 已销毁，不能再操作底图')
    }
  }

  get active(): string | null {
    return this.activeId
  }

  get size(): number {
    return this.entries.size
  }

  has(id: string): boolean {
    return this.entries.has(id)
  }

  get(id: string): Cesium.ImageryLayer | undefined {
    return this.entries.get(id)?.layer
  }

  list(): ImageryLayerInfo[] {
    return Array.from(this.entries.values()).map(({ id, label, layer }) => ({
      id,
      label,
      show: layer.show,
      alpha: layer.alpha
    }))
  }

  /** 添加底图。返回创建的 ImageryLayer。 */
  async add(source: ImagerySource, options: AddImageryOptions = {}): Promise<Cesium.ImageryLayer> {
    this.assertAlive()
    const id = options.id ?? (typeof source === 'string' ? source : `imagery-${++this.seq}`)
    this.remove(id)
    const token = this.loads.begin(id)
    const resolved = await this.resolve(source)
    this.assertAlive()
    if (!this.loads.current(id, token)) throw cancelledLoad()

    const layer = this.viewer.imageryLayers.addImageryProvider(resolved.provider, options.index)
    layer.show = options.show ?? true
    if (options.alpha !== undefined) layer.alpha = options.alpha

    this.entries.set(id, { id, label: resolved.label, layer })
    this.definitions.set(id, source)
    if (layer.show) this.activeId = id
    this.events.emit('imagery:change', { id })
    return layer
  }

  /** 批量添加，按顺序叠加。 */
  async addMany(
    sources: Array<{ source: ImagerySource } & AddImageryOptions>
  ): Promise<Cesium.ImageryLayer[]> {
    const layers: Cesium.ImageryLayer[] = []
    for (const { source, ...options } of sources) {
      layers.push(await this.add(source, options))
    }
    return layers
  }

  /** 只显示指定底图，传 null 表示全部隐藏。 */
  switchTo(id: string | null): void {
    this.assertAlive()
    if (id !== null && !this.entries.has(id)) {
      this.log.warn(`底图不存在：${id}`)
      return
    }
    this.entries.forEach(({ id: key, layer }) => {
      layer.show = key === id
    })
    this.activeId = id
    this.events.emit('imagery:change', { id })
  }

  setShow(id: string, show: boolean): void {
    this.assertAlive()
    const entry = this.entries.get(id)
    if (!entry) return
    entry.layer.show = show
    if (show) this.activeId = id
    else if (this.activeId === id) this.activeId = null
    this.events.emit('imagery:change', { id: this.activeId })
  }

  setAlpha(id: string, alpha: number): void {
    this.assertAlive()
    const entry = this.entries.get(id)
    if (!entry) return
    entry.layer.alpha = Math.min(1, Math.max(0, alpha))
    this.events.emit('imagery:update', { id })
  }

  remove(id: string): void {
    this.assertAlive()
    this.loads.cancel(id)
    const entry = this.entries.get(id)
    if (!entry) return
    this.viewer.imageryLayers.remove(entry.layer, true)
    this.entries.delete(id)
    this.definitions.delete(id)
    if (this.activeId === id) this.activeId = null
    this.events.emit('imagery:change', { id: this.activeId })
  }

  clear(): void {
    this.assertAlive()
    this.clearInternal()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    if (!this.viewer.isDestroyed()) this.clearInternal()
  }

  private clearInternal(): void {
    this.loads.clear()
    this.entries.forEach(({ layer }) => {
      if (!this.viewer.isDestroyed()) this.viewer.imageryLayers.remove(layer, true)
    })
    this.entries.clear()
    this.definitions.clear()
    this.activeId = null
    this.events.emit('imagery:change', { id: null })
  }

  private async resolve(
    source: ImagerySource
  ): Promise<{ id?: string; label: string; provider: Cesium.ImageryProvider }> {
    if (typeof source === 'string') {
      const preset = this.presets[source]
      if (!preset) {
        const available = Object.keys(this.presets).join(', ')
        throw new Error(
          `@cesium-kit/core: 未知底图预设 "${source}"，可用值：${available}；也可直接传入 ImageryProvider`
        )
      }
      return { id: preset.id, label: preset.label, provider: await preset.create() }
    }

    if (typeof source === 'function') {
      return { label: '自定义底图', provider: await source() }
    }

    if (isPromiseLike(source)) {
      return { label: '自定义底图', provider: await source }
    }

    if (isImageryProvider(source)) {
      return { label: '自定义底图', provider: source }
    }

    throw new Error('@cesium-kit/core: 无法识别的底图来源')
  }
}
