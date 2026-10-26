import * as Cesium from 'cesium'
import { sampleFrame } from '../data/interpolate'
import { toCesiumColor, sampleRamp } from '../shared/color'
import { paletteFor } from '../shared/palettes'
import type {
  WeatherFrame,
  WeatherLayerData,
  WeatherScale
} from '../shared/types'

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
}

function valueAt(
  values: Float32Array | number[],
  index: number
): number {
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
  private readonly cache = new WeakMap<WeatherFrame, string>()
  private visible: boolean
  private alphaValue: number
  private added = false
  private destroyed = false

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

    if (this.viewer.isDestroyed()) return
    const next = this.createLayer(frame)
    const previous = this.layer
    this.layer = next
    if (previous && !this.viewer.isDestroyed()) {
      this.viewer.imageryLayers.remove(previous, true)
    }
    this.requestRender()
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

  private createLayer(frame: WeatherFrame): Cesium.ImageryLayer {
    const { bounds } = frame
    const rectangle = Cesium.Rectangle.fromDegrees(
      bounds.west,
      bounds.south,
      bounds.east,
      bounds.north
    )
    const url = this.frameImageUrl(frame)
    const size = this.frameTileSize(frame)
    const provider = new Cesium.SingleTileImageryProvider({
      url,
      rectangle,
      tileWidth: size.width,
      tileHeight: size.height
    })
    const layer = this.viewer.imageryLayers.addImageryProvider(provider)
    layer.show = this.visible
    layer.alpha = this.alphaValue
    return layer
  }

  private removeLayer(): void {
    const layer = this.layer
    this.layer = null
    if (layer && !this.viewer.isDestroyed()) {
      this.viewer.imageryLayers.remove(layer, true)
    }
  }

  private frameTileSize(frame: WeatherFrame): { width: number; height: number } {
    if (frame.imageUrl) {
      return { width: frame.width ?? 1024, height: frame.height ?? 512 }
    }
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
        if (
          !Number.isFinite(value) ||
          (noData !== undefined && value === noData)
        ) {
          image.data[index + 3] = 0
          continue
        }
        const color = sampleRamp(
          this.colors,
          normalizeValue(value, this.min, this.max, this.scale)
        )
        image.data[index] = Math.round(color.red * 255)
        image.data[index + 1] = Math.round(color.green * 255)
        image.data[index + 2] = Math.round(color.blue * 255)
        image.data[index + 3] = Math.round(color.alpha * 255)
      }
    }
    context.putImageData(image, 0, 0)

    const maxSide = 2048
    const scale = Math.max(
      1,
      Math.min(this.canvasScale, Math.floor(maxSide / Math.max(width, height)) || 1)
    )
    if (scale === 1) return source.toDataURL('image/png')

    const target = document.createElement('canvas')
    target.width = width * scale
    target.height = height * scale
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
