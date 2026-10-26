import * as Cesium from 'cesium'
import { sampleFrame } from '../data/interpolate'
import { toCesiumColor, sampleRamp } from '../shared/color'
import { paletteFor } from '../shared/palettes'
import type { WeatherFrame, WeatherLayerData, WeatherScale } from '../shared/types'

export interface RasterWeatherLayerOptions {
  visible?: boolean
  alpha?: number
  /** 覆盖数据自带色带 */
  colors?: string[]
  min?: number
  max?: number
  scale?: WeatherScale
  /** Canvas 放大倍数，默认 8，最大边长约 2048 */
  canvasScale?: number
  /** 帧切换是否淡入淡出，默认 true */
  crossfade?: boolean
  /** 淡入淡出时长（毫秒），默认 300 */
  crossfadeDuration?: number
  onError?: (error: unknown) => void
}

interface FrameSize {
  width: number
  height: number
}

function valueAt(values: Float32Array | number[], index: number): number {
  return Number(values[index] ?? 0)
}

function normalizeValue(value: number, min: number, max: number, scale: WeatherScale): number {
  if (scale === 'log') {
    const safeMin = Math.max(0.0001, min)
    const safeValue = Math.max(safeMin, value)
    const logMin = Math.log(safeMin)
    const logMax = Math.log(Math.max(safeMin + 0.0001, max))
    return (Math.log(safeValue) - logMin) / (logMax - logMin)
  }
  const span = max - min || 1
  return (value - min) / span
}

/**
 * 天气栅格图层：把网格值渲染为 Canvas 图片，再通过 SingleTileImageryProvider 叠加到 Cesium。
 *
 * 图层不进入 ImageryManager，避免影响底图的 active 状态；由 Feature 通过
 * `ctx.layers.onDispose` 登记销毁。
 */
export class RasterWeatherLayer {
  private layer: Cesium.ImageryLayer | null = null
  private currentFrame: WeatherFrame
  private readonly colors: Cesium.Color[]
  private readonly min: number
  private readonly max: number
  private readonly scale: WeatherScale
  private readonly canvasScale: number
  private readonly crossfade: boolean
  private readonly crossfadeDuration: number
  private readonly onError?: (error: unknown) => void
  private readonly cache = new WeakMap<WeatherFrame, string>()
  private readonly imageSizeCache = new Map<string, Promise<FrameSize>>()
  private readonly fadingLayers = new Set<Cesium.ImageryLayer>()
  private animationFrame: number | null = null
  private visible: boolean
  private alphaValue: number
  private added = false
  private destroyed = false
  private sequence = 0

  constructor(
    private readonly viewer: Cesium.Viewer,
    data: WeatherLayerData,
    options: RasterWeatherLayerOptions = {}
  ) {
    const frame = data.frames[0]
    if (!frame) throw new Error('@cesium-kit/weather: 图层没有可用帧')
    this.currentFrame = frame
    this.visible = options.visible ?? data.defaultVisible ?? true
    this.alphaValue = Math.min(1, Math.max(0, options.alpha ?? data.defaultAlpha ?? 0.85))
    this.min = options.min ?? data.legend?.min ?? paletteFor(data.kind).min
    this.max = options.max ?? data.legend?.max ?? paletteFor(data.kind).max
    this.scale = options.scale ?? data.scale ?? 'linear'
    this.canvasScale = Math.max(1, Math.floor(options.canvasScale ?? 8))
    this.crossfade = options.crossfade ?? true
    this.crossfadeDuration = Math.max(0, options.crossfadeDuration ?? 300)
    this.onError = options.onError
    this.colors = (options.colors ?? data.legend?.colors ?? paletteFor(data.kind).colors).map(
      toCesiumColor
    )
  }

  get show(): boolean {
    return this.visible
  }

  set show(value: boolean) {
    this.visible = value
    if (this.layer) this.layer.show = value
    this.fadingLayers.forEach((layer) => {
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

  get frame(): WeatherFrame {
    return this.currentFrame
  }

  get renderLayer(): Cesium.ImageryLayer | null {
    return this.layer
  }

  add(): void {
    if (this.destroyed || this.added) return
    this.added = true
    this.updateFrame(this.currentFrame)
  }

  remove(): void {
    this.added = false
    this.removeLayer()
  }

  updateFrame(frame: WeatherFrame): void {
    if (this.destroyed) return
    this.currentFrame = frame
    if (!this.added) return
    void this.applyFrame(frame)
  }

  /** 预生成下一帧图片，减少播放时的卡顿。 */
  preloadFrame(frame: WeatherFrame): void {
    if (this.destroyed) return
    if (frame.imageUrl) {
      void Promise.resolve(this.resolveFrameSize(frame)).catch((error) => this.onError?.(error))
      return
    }
    setTimeout(() => {
      if (this.destroyed) return
      try {
        this.frameImageUrl(frame)
      } catch (error) {
        this.onError?.(error)
      }
    }, 0)
  }

  /** 返回当前帧的图片地址，图片帧直接返回原地址。 */
  frameImageUrl(frame: WeatherFrame): string {
    if (frame.imageUrl) return frame.imageUrl
    const cached = this.cache.get(frame)
    if (cached) return cached
    const url = this.renderFrameToDataUrl(frame)
    this.cache.set(frame, url)
    return url
  }

  getValueAt(lon: number, lat: number): number | null {
    return sampleFrame(this.currentFrame, lon, lat)
  }

  zoomTo(duration = 0): void {
    const { bounds } = this.currentFrame
    const destination = Cesium.Rectangle.fromDegrees(
      bounds.west,
      bounds.south,
      bounds.east,
      bounds.north
    )
    if (duration > 0) {
      this.viewer.camera.flyTo({ destination, duration })
    } else {
      this.viewer.camera.setView({ destination })
    }
  }

  isDestroyed(): boolean {
    return this.destroyed
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.added = false
    this.removeLayer()
    this.requestRender()
  }

  private async applyFrame(frame: WeatherFrame): Promise<void> {
    const sequence = ++this.sequence
    try {
      const size = await this.resolveFrameSize(frame)
      if (
        sequence !== this.sequence ||
        this.destroyed ||
        !this.added ||
        this.viewer.isDestroyed()
      ) {
        return
      }
      const next = this.createLayer(frame, size)
      const previous = this.layer
      this.layer = next
      if (!previous) {
        next.alpha = this.alphaValue
        return
      }
      if (!this.crossfade || this.crossfadeDuration === 0) {
        this.removeImageryLayer(previous)
        next.alpha = this.alphaValue
        return
      }
      next.alpha = 0
      this.animateCrossfade(previous, next)
    } catch (error) {
      this.onError?.(error)
    }
  }

  private createLayer(frame: WeatherFrame, size: FrameSize): Cesium.ImageryLayer {
    const { bounds } = frame
    const rectangle = Cesium.Rectangle.fromDegrees(
      bounds.west,
      bounds.south,
      bounds.east,
      bounds.north
    )
    const provider = new Cesium.SingleTileImageryProvider({
      url: this.frameImageUrl(frame),
      rectangle,
      tileWidth: size.width,
      tileHeight: size.height
    })
    const layer = this.viewer.imageryLayers.addImageryProvider(provider)
    layer.show = this.visible
    layer.alpha = this.alphaValue
    return layer
  }

  private animateCrossfade(previous: Cesium.ImageryLayer, next: Cesium.ImageryLayer): void {
    this.cancelAnimation()
    this.fadingLayers.add(previous)
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
        this.animationFrame = null
        this.fadingLayers.delete(previous)
        this.removeImageryLayer(previous)
        return
      }
      if (typeof requestAnimationFrame === 'function') {
        this.animationFrame = requestAnimationFrame(step)
      } else {
        setTimeout(step, 16)
      }
    }
    step()
  }

  private cancelAnimation(): void {
    if (this.animationFrame !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.animationFrame)
    }
    this.animationFrame = null
    this.fadingLayers.forEach((layer) => this.removeImageryLayer(layer))
    this.fadingLayers.clear()
  }

  private removeLayer(): void {
    this.cancelAnimation()
    const layer = this.layer
    this.layer = null
    if (layer) this.removeImageryLayer(layer)
  }

  private removeImageryLayer(layer: Cesium.ImageryLayer): void {
    if (!this.viewer.isDestroyed()) {
      this.viewer.imageryLayers.remove(layer, true)
    }
  }

  private resolveFrameSize(frame: WeatherFrame): Promise<FrameSize> | FrameSize {
    if (frame.imageUrl) {
      if (frame.width && frame.height) {
        return { width: frame.width, height: frame.height }
      }
      const cached = this.imageSizeCache.get(frame.imageUrl)
      if (cached) return cached
      const pending = this.loadImageSize(frame.imageUrl)
      this.imageSizeCache.set(frame.imageUrl, pending)
      return pending
    }
    return this.gridTileSize(frame)
  }

  private loadImageSize(url: string): Promise<FrameSize> {
    return new Promise((resolve) => {
      if (typeof Image === 'undefined') {
        resolve({ width: 1024, height: 512 })
        return
      }
      const image = new Image()
      image.onload = () =>
        resolve({
          width: image.naturalWidth || 1024,
          height: image.naturalHeight || 512
        })
      image.onerror = () => resolve({ width: 1024, height: 512 })
      image.src = url
    })
  }

  private gridTileSize(frame: WeatherFrame): FrameSize {
    const width = frame.width ?? 1
    const height = frame.height ?? 1
    const maxSide = 2048
    const scale = Math.max(
      1,
      Math.min(this.canvasScale, Math.floor(maxSide / Math.max(width, height)) || 1)
    )
    return { width: width * scale, height: height * scale }
  }

  private renderFrameToDataUrl(frame: WeatherFrame): string {
    if (typeof document === 'undefined') {
      throw new Error('@cesium-kit/weather: 当前环境没有 document，无法渲染网格数据')
    }
    const { width, height, values, noData } = frame
    if (!width || !height || !values) {
      throw new Error('@cesium-kit/weather: 网格帧缺少 width/height/values')
    }

    const source = document.createElement('canvas')
    source.width = width
    source.height = height
    const context = source.getContext('2d')
    if (!context) {
      throw new Error('@cesium-kit/weather: Canvas 2D 不可用')
    }

    const image = context.createImageData(width, height)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const value = valueAt(values, y * width + x)
        const index = ((height - 1 - y) * width + x) * 4
        if (!Number.isFinite(value) || (noData !== undefined && value === noData)) {
          image.data[index + 3] = 0
          continue
        }
        const color = sampleRamp(this.colors, normalizeValue(value, this.min, this.max, this.scale))
        image.data[index] = Math.round(color.red * 255)
        image.data[index + 1] = Math.round(color.green * 255)
        image.data[index + 2] = Math.round(color.blue * 255)
        image.data[index + 3] = Math.round(color.alpha * 255)
      }
    }
    context.putImageData(image, 0, 0)

    const size = this.gridTileSize(frame)
    if (size.width === width && size.height === height) {
      return source.toDataURL('image/png')
    }

    const target = document.createElement('canvas')
    target.width = size.width
    target.height = size.height
    const targetContext = target.getContext('2d')
    if (!targetContext) {
      throw new Error('@cesium-kit/weather: Canvas 2D 不可用')
    }
    targetContext.imageSmoothingEnabled = true
    targetContext.drawImage(source, 0, 0, target.width, target.height)
    return target.toDataURL('image/png')
  }

  private requestRender(): void {
    if (!this.viewer.isDestroyed()) this.viewer.scene.requestRender()
  }
}
