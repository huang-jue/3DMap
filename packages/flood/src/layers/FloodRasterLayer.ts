import * as Cesium from 'cesium'
import { toCesiumColor, sampleRamp } from '../shared/color'
import { DEPTH_COLORS } from '../shared/palettes'
import type { RasterFrame } from '../shared/types'

export interface FloodRasterLayerOptions {
  visible?: boolean
  alpha?: number
  colors?: string[]
  min?: number
  max?: number
  noData?: number
  canvasScale?: number
  crossfade?: boolean
  crossfadeDuration?: number
  onError?: (error: unknown) => void
}

function valueAt(values: Float32Array | number[], index: number): number {
  return Number(values[index] ?? 0)
}

function normalize(value: number, min: number, max: number): number {
  const span = max - min || 1
  return (value - min) / span
}

/** 淹没/降雨栅格图层：网格转 Canvas，再叠加到 Cesium。 */
export class FloodRasterLayer {
  private layer: Cesium.ImageryLayer | null = null
  private frame: RasterFrame
  private readonly colors: Cesium.Color[]
  private readonly min: number
  private readonly max: number
  private readonly noData?: number
  private readonly canvasScale: number
  private readonly crossfade: boolean
  private readonly crossfadeDuration: number
  private readonly onError?: (error: unknown) => void
  private readonly cache = new WeakMap<RasterFrame, string>()
  private readonly fading = new Set<Cesium.ImageryLayer>()
  private animation: number | null = null
  private visible: boolean
  private alphaValue: number
  private added = false
  private destroyed = false
  private sequence = 0

  constructor(
    private readonly viewer: Cesium.Viewer,
    frame: RasterFrame,
    options: FloodRasterLayerOptions = {}
  ) {
    this.frame = frame
    this.visible = options.visible ?? true
    this.alphaValue = Math.min(1, Math.max(0, options.alpha ?? 0.82))
    this.colors = (options.colors ?? DEPTH_COLORS).map(toCesiumColor)
    this.min = options.min ?? 0
    this.max = options.max ?? 10
    this.noData = options.noData
    this.canvasScale = Math.max(1, options.canvasScale ?? 8)
    this.crossfade = options.crossfade ?? true
    this.crossfadeDuration = Math.max(0, options.crossfadeDuration ?? 300)
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

  get currentFrame(): RasterFrame {
    return this.frame
  }

  get renderLayer(): Cesium.ImageryLayer | null {
    return this.layer
  }

  add(): void {
    if (this.destroyed || this.added) return
    this.added = true
    this.updateFrame(this.frame)
  }

  updateFrame(frame: RasterFrame): void {
    if (this.destroyed) return
    this.frame = frame
    if (!this.added) return
    void this.applyFrame(frame)
  }

  preloadFrame(frame: RasterFrame): void {
    if (this.destroyed) return
    setTimeout(() => {
      if (this.destroyed) return
      try {
        this.dataUrl(frame)
      } catch (error) {
        this.onError?.(error)
      }
    }, 0)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.added = false
    this.cancelAnimation()
    this.removeLayer(this.layer)
    this.layer = null
  }

  isDestroyed(): boolean {
    return this.destroyed
  }

  private async applyFrame(frame: RasterFrame): Promise<void> {
    const sequence = ++this.sequence
    try {
      await Promise.resolve()
      if (sequence !== this.sequence || this.destroyed || this.viewer.isDestroyed()) return
      const next = this.createLayer(frame)
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
      this.onError?.(error)
    }
  }

  private createLayer(frame: RasterFrame): Cesium.ImageryLayer {
    const { bounds } = frame
    const provider = new Cesium.SingleTileImageryProvider({
      url: this.dataUrl(frame),
      rectangle: Cesium.Rectangle.fromDegrees(bounds.west, bounds.south, bounds.east, bounds.north),
      tileWidth: this.tileSize(frame).width,
      tileHeight: this.tileSize(frame).height
    })
    const layer = this.viewer.imageryLayers.addImageryProvider(provider)
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

  private tileSize(frame: RasterFrame): { width: number; height: number } {
    const maxSide = 2048
    const scale = Math.max(
      1,
      Math.min(this.canvasScale, Math.floor(maxSide / Math.max(frame.width, frame.height)) || 1)
    )
    return { width: frame.width * scale, height: frame.height * scale }
  }

  private dataUrl(frame: RasterFrame): string {
    const cached = this.cache.get(frame)
    if (cached) return cached
    if (typeof document === 'undefined') {
      throw new Error('@sgyx/cesium-kit-flood: 当前环境没有 document')
    }
    const { width, height, values, noData } = frame
    const source = document.createElement('canvas')
    source.width = width
    source.height = height
    const context = source.getContext('2d')
    if (!context) throw new Error('@sgyx/cesium-kit-flood: Canvas 2D 不可用')
    const image = context.createImageData(width, height)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const value = valueAt(values, y * width + x)
        const index = ((height - 1 - y) * width + x) * 4
        const missingNoData = noData !== undefined && value === noData
        if (
          !Number.isFinite(value) ||
          missingNoData ||
          (this.noData !== undefined && value === this.noData)
        ) {
          image.data[index + 3] = 0
          continue
        }
        const color = sampleRamp(this.colors, normalize(value, this.min, this.max))
        image.data[index] = Math.round(color.red * 255)
        image.data[index + 1] = Math.round(color.green * 255)
        image.data[index + 2] = Math.round(color.blue * 255)
        image.data[index + 3] = Math.round(color.alpha * 255)
      }
    }
    context.putImageData(image, 0, 0)
    const size = this.tileSize(frame)
    if (size.width === width && size.height === height) {
      return source.toDataURL('image/png')
    }
    const target = document.createElement('canvas')
    target.width = size.width
    target.height = size.height
    const targetContext = target.getContext('2d')
    if (!targetContext) throw new Error('@sgyx/cesium-kit-flood: Canvas 2D 不可用')
    targetContext.imageSmoothingEnabled = true
    targetContext.drawImage(source, 0, 0, target.width, target.height)
    const url = target.toDataURL('image/png')
    this.cache.set(frame, url)
    return url
  }

  private requestRender(): void {
    if (!this.viewer.isDestroyed()) this.viewer.scene.requestRender()
  }
}
