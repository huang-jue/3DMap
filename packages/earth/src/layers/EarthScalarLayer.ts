import { RasterRenderer } from './RasterRenderer'
import * as Cesium from 'cesium'
import { sampleRasterValue, nearestItem } from '../data/time'
import { toCesiumColor, sampleRamp, toCssColor } from '../shared/color'
import type {
  EarthInterpolation,
  EarthLegend,
  EarthScalarData,
  EarthScalarFrame
} from '../shared/types'

export interface EarthScalarLayerOptions {
  visible?: boolean
  alpha?: number
  colors?: string[]
  min?: number
  max?: number
  noData?: number
  canvasScale?: number
  crossfade?: boolean
  crossfadeDuration?: number
  interpolation?: EarthInterpolation
  scale?: 'linear' | 'log'
  onError?: (error: unknown) => void
}

function normalize(value: number, min: number, max: number, scale: 'linear' | 'log'): number {
  if (scale === 'log') {
    const safeMin = Math.max(0.0001, min)
    const safeValue = Math.max(safeMin, value)
    return (
      (Math.log(safeValue) - Math.log(safeMin)) /
      (Math.log(Math.max(safeMin + 0.0001, max)) - Math.log(safeMin))
    )
  }
  const span = max - min || 1
  return (value - min) / span
}

/** 通用地球标量叠加层：网格转 Canvas，再叠加到 Cesium ImageryLayer。 */
export class EarthScalarLayer {
  private layer: Cesium.ImageryLayer | null = null
  private frame: EarthScalarFrame
  private readonly colors: Cesium.Color[]
  private readonly colorTable = new Uint8ClampedArray(4096 * 4)
  private readonly min: number
  private readonly max: number
  private readonly noData?: number
  private readonly crossfade: boolean
  private readonly crossfadeDuration: number
  private readonly onError?: (error: unknown) => void
  private readonly renderer = new RasterRenderer()
  private readonly cache = new Map<string, string>()
  private readonly frameIds = new WeakMap<EarthScalarFrame, number>()
  private nextFrameId = 0
  private readonly fading = new Set<Cesium.ImageryLayer>()
  private animation: number | null = null
  private interpolation: EarthInterpolation
  private readonly scale: 'linear' | 'log'
  private canvasScale: number
  private visible: boolean
  private alphaValue: number
  private added = false
  private destroyed = false
  private sequence = 0
  private rendered = false

  constructor(
    private readonly viewer: Cesium.Viewer,
    private readonly data: EarthScalarData,
    options: EarthScalarLayerOptions = {}
  ) {
    const frame = data.frames[0]
    if (!frame) throw new Error('@sgyx/cesium-kit-earth: 标量数据为空')
    this.frame = frame
    this.visible = options.visible ?? true
    this.alphaValue = Math.min(1, Math.max(0, options.alpha ?? 0.82))
    this.colors = (options.colors ?? data.legend.colors).map(toCesiumColor)
    for (let i = 0; i < 4096; i++) {
      const color = sampleRamp(this.colors, i / 4095)
      this.colorTable.set(
        [color.red * 255, color.green * 255, color.blue * 255, color.alpha * 255],
        i * 4
      )
    }
    this.min = options.min ?? data.legend.min
    this.max = options.max ?? data.legend.max
    this.noData = options.noData
    this.canvasScale = Math.max(1, options.canvasScale ?? 8)
    this.crossfade = options.crossfade ?? true
    this.crossfadeDuration = Math.max(0, options.crossfadeDuration ?? 260)
    this.interpolation = options.interpolation ?? 'bilinear'
    this.scale = options.scale ?? 'linear'
    this.onError = options.onError
  }

  get show(): boolean {
    return this.visible
  }

  set show(value: boolean) {
    this.visible = value
    if (this.layer) this.layer.show = value
    this.fading.forEach((layer) => {
      layer.show = value
    })
    this.requestRender()
  }

  get alpha(): number {
    return this.alphaValue
  }

  set alpha(value: number) {
    this.alphaValue = Math.min(1, Math.max(0, value))
    if (this.layer) this.layer.alpha = this.alphaValue
    this.requestRender()
  }

  get currentFrame(): EarthScalarFrame {
    return this.frame
  }
  get displayedFrame(): EarthScalarFrame | null {
    return this.rendered ? this.frame : null
  }

  get legend(): EarthLegend {
    return {
      min: this.min,
      max: this.max,
      unit: this.data.legend.unit,
      colors: this.data.legend.colors
    }
  }

  add(): void {
    if (this.destroyed || this.added) return
    this.added = true
    this.updateFrame(this.frame)
  }

  updateFrame(frame: EarthScalarFrame): void {
    if (this.destroyed) return
    if (!this.added) {
      this.frame = frame
      return
    }
    void this.applyFrame(frame)
  }

  setTime(time: Date): void {
    const frame = nearestItem(this.data.frames, time)
    if (frame) this.updateFrame(frame)
  }

  setSettings(settings: { interpolation?: EarthInterpolation; hd?: boolean }): void {
    if (settings.interpolation) this.interpolation = settings.interpolation
    if (settings.hd !== undefined) this.canvasScale = settings.hd ? 12 : 8
    if (this.added) void this.applyFrame(this.frame, true)
  }

  getValueAt(lon: number, lat: number): number | null {
    return sampleRasterValue(
      this.frame.values,
      this.frame.width,
      this.frame.height,
      this.frame.bounds,
      lon,
      lat,
      this.interpolation,
      this.frame.noData
    )
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.added = false
    this.cancelAnimation()
    this.renderer.destroy()
    this.cache.forEach((url) => URL.revokeObjectURL(url))
    this.cache.clear()
    this.removeLayer(this.layer)
    this.layer = null
  }

  isDestroyed(): boolean {
    return this.destroyed
  }

  private async applyFrame(frame: EarthScalarFrame, force = false): Promise<void> {
    const sequence = ++this.sequence
    try {
      await Promise.resolve()
      if (sequence !== this.sequence || this.destroyed || this.viewer.isDestroyed()) return
      const url = await this.dataUrl(frame, force)
      if (sequence !== this.sequence || this.destroyed || this.viewer.isDestroyed()) return
      const next = this.createLayer(frame, url)
      this.frame = frame
      this.rendered = true
      const previous = this.layer
      this.layer = next
      if (!previous) {
        next.alpha = this.alphaValue
        return
      }
      if (!this.crossfade || this.crossfadeDuration === 0) {
        this.removeLayer(previous)
        next.alpha = this.alphaValue
        return
      }
      next.alpha = 0
      this.animateCrossfade(previous, next)
    } catch (error) {
      if (!this.destroyed && sequence === this.sequence) this.onError?.(error)
    }
  }

  private createLayer(frame: EarthScalarFrame, url: string): Cesium.ImageryLayer {
    const bounds = frame.bounds
    const provider = new Cesium.SingleTileImageryProvider({
      url,
      rectangle: Cesium.Rectangle.fromDegrees(bounds.west, bounds.south, bounds.east, bounds.north),
      tileWidth: this.tileSize(frame).width,
      tileHeight: this.tileSize(frame).height
    })
    const existingIndex = this.layer ? this.viewer.imageryLayers.indexOf(this.layer) : -1
    const layer = this.viewer.imageryLayers.addImageryProvider(
      provider,
      existingIndex >= 0 ? existingIndex : undefined
    )
    layer.show = this.visible
    layer.alpha = this.alphaValue
    return layer
  }

  private animateCrossfade(previous: Cesium.ImageryLayer, next: Cesium.ImageryLayer): void {
    this.cancelAnimation()
    this.fading.add(previous)
    const target = this.alphaValue
    const started = Date.now()
    const step = (): void => {
      if (this.destroyed) {
        this.cancelAnimation()
        return
      }
      const progress = Math.min(1, (Date.now() - started) / this.crossfadeDuration)
      next.alpha = target * progress
      previous.alpha = target * (1 - progress)
      this.requestRender()
      if (progress >= 1) {
        this.animation = null
        this.fading.delete(previous)
        this.removeLayer(previous)
        return
      }
      if (typeof requestAnimationFrame === 'function') {
        this.animation = requestAnimationFrame(step)
      } else {
        setTimeout(step, 16)
      }
    }
    step()
  }

  private cancelAnimation(): void {
    if (this.animation !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.animation)
    }
    this.animation = null
    this.fading.forEach((layer) => this.removeLayer(layer))
    this.fading.clear()
  }

  private removeLayer(layer: Cesium.ImageryLayer | null): void {
    if (layer && !this.viewer.isDestroyed()) {
      this.viewer.imageryLayers.remove(layer, true)
    }
  }

  private tileSize(frame: EarthScalarFrame): { width: number; height: number } {
    const maxSide = 2048
    const scale = Math.max(
      1,
      Math.min(this.canvasScale, Math.floor(maxSide / Math.max(frame.width, frame.height)) || 1)
    )
    return { width: frame.width * scale, height: frame.height * scale }
  }

  private async dataUrl(frame: EarthScalarFrame, force = false): Promise<string> {
    let id = this.frameIds.get(frame)
    if (id === undefined) {
      id = ++this.nextFrameId
      this.frameIds.set(frame, id)
    }
    const size = this.tileSize(frame)
    const key = `${id}:${this.interpolation}:${size.width}:${size.height}`
    const cached = this.cache.get(key)
    if (cached && !force) {
      this.cache.delete(key)
      this.cache.set(key, cached)
      return cached
    }
    const url = await this.renderer.render({
      width: frame.width,
      height: frame.height,
      targetWidth: size.width,
      targetHeight: size.height,
      values: frame.values,
      colors: this.colorTable,
      min: this.min,
      max: this.max,
      noData: frame.noData,
      extraNoData: this.noData,
      log: this.scale === 'log',
      smooth: this.interpolation === 'bilinear'
    })
    if (this.destroyed) {
      URL.revokeObjectURL(url)
      throw new DOMException('已取消', 'AbortError')
    }
    if (cached) URL.revokeObjectURL(cached)
    this.cache.set(key, url)
    while (this.cache.size > 3) {
      const first = this.cache.keys().next().value!
      URL.revokeObjectURL(this.cache.get(first)!)
      this.cache.delete(first)
    }
    return url
  }

  /** 当前值对应的色带颜色，供图例/点查使用。 */
  colorAt(value: number): string {
    return toCssColor(sampleRamp(this.colors, normalize(value, this.min, this.max, this.scale)))
  }

  private requestRender(): void {
    if (!this.viewer.isDestroyed()) this.viewer.scene.requestRender()
  }
}
