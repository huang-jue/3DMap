import * as Cesium from 'cesium'
import { WindLayer } from 'cesium-wind-layer'
import type { WindData, WindLayerOptions as RawWindLayerOptions } from 'cesium-wind-layer'
import type { PrimitiveLike } from '@cesium-kit/core'
import { interpolateWind } from '../data/interpolate'
import type { WindGrid, WindSample } from '../shared/types'

export interface WindFieldLayerOptions {
  /** 粒子纹理尺寸，粒子总数 = size²，默认 96 */
  particlesTextureSize?: number
  /** 粒子离地高度（米），默认 50000 */
  particleHeight?: number
  lineWidth?: { min: number; max: number }
  lineLength?: { min: number; max: number }
  speedFactor?: number
  dropRate?: number
  dropRateBump?: number
  colors?: string[]
  /** 数据已经按南到北排好，通常保持 false */
  flipY?: boolean
  useViewerBounds?: boolean
  domain?: { min?: number; max?: number }
  displayRange?: { min?: number; max?: number }
  /** 是否播放粒子动画，默认 true */
  dynamic?: boolean
  /** 是否叠加风速彩色底图，默认 false */
  showSpeedOverlay?: boolean
  /** 风速底图透明度，默认 0.35 */
  speedOverlayAlpha?: number
  /** 风速底图色带，默认蓝-青-绿-黄 */
  speedOverlayColors?: string[]
}

const DEFAULT_OPTIONS: Required<
  Pick<
    WindFieldLayerOptions,
    | 'particlesTextureSize'
    | 'particleHeight'
    | 'lineWidth'
    | 'lineLength'
    | 'speedFactor'
    | 'dropRate'
    | 'dropRateBump'
    | 'colors'
    | 'flipY'
    | 'useViewerBounds'
    | 'dynamic'
    | 'showSpeedOverlay'
    | 'speedOverlayAlpha'
    | 'speedOverlayColors'
  >
> = {
  particlesTextureSize: 96,
  particleHeight: 50000,
  lineWidth: { min: 1.2, max: 2.4 },
  lineLength: { min: 60, max: 160 },
  speedFactor: 1.5,
  dropRate: 0.002,
  dropRateBump: 0.0005,
  colors: ['#ffffff'],
  flipY: false,
  useViewerBounds: false,
  dynamic: true,
  showSpeedOverlay: false,
  speedOverlayAlpha: 0.4,
  speedOverlayColors: ['#777acb', '#568bd5', '#54b8cb', '#72ceac', '#e9e99a']
}

function toFloat32Array(value: Float32Array | number[]): Float32Array {
  return value instanceof Float32Array ? value : Float32Array.from(value)
}

// Feature 参数选择器会包含值为 undefined 的键，不能让它们覆盖渲染默认值。
function definedOptions(options: WindFieldLayerOptions): WindFieldLayerOptions {
  return Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined))
}

function toRawWindData(grid: WindGrid): WindData {
  return {
    u: { array: toFloat32Array(grid.u) },
    v: { array: toFloat32Array(grid.v) },
    ...(grid.speed ? { speed: { array: toFloat32Array(grid.speed) } } : {}),
    width: grid.width,
    height: grid.height,
    bounds: { ...grid.bounds }
  }
}

/**
 * 气象风场图层。封装 cesium-wind-layer，对外提供稳定的生命周期与数据接口。
 *
 * 注意：底层 WindLayer 在构造时会自动挂载内部图元，因此这里做成懒加载，
 * 只有调用 add() 才真正创建，避免重复 add 导致引用计数泄漏。
 */
interface ListenerTarget {
  addEventListener(listener: (...args: never[]) => void, scope?: object): void
  removeEventListener(listener: (...args: never[]) => void, scope?: object): void
}

function sampleRamp(colors: Cesium.Color[], value: number): Cesium.Color {
  if (colors.length === 0) return Cesium.Color.WHITE
  if (colors.length === 1) return colors[0] as Cesium.Color
  const clamped = Math.min(1, Math.max(0, value))
  const scaled = clamped * (colors.length - 1)
  const index = Math.floor(scaled)
  const next = Math.min(colors.length - 1, index + 1)
  const local = scaled - index
  const from = colors[index] as Cesium.Color
  const to = colors[next] as Cesium.Color
  return new Cesium.Color(
    from.red + (to.red - from.red) * local,
    from.green + (to.green - from.green) * local,
    from.blue + (to.blue - from.blue) * local,
    from.alpha + (to.alpha - from.alpha) * local
  )
}

export class WindFieldLayer implements PrimitiveLike {
  private layer: WindLayer | null = null
  private speedLayer: Cesium.ImageryLayer | null = null
  private grid: WindGrid
  private options: WindFieldLayerOptions
  private visible = true
  private added = false
  private destroyed = false
  private previousRequestRenderMode: boolean | undefined
  private capturedListeners: Array<() => void> = []

  constructor(
    private readonly viewer: Cesium.Viewer,
    grid: WindGrid,
    options: WindFieldLayerOptions = {}
  ) {
    this.grid = grid
    this.options = { ...DEFAULT_OPTIONS, ...definedOptions(options) }
  }

  get show(): boolean {
    return this.visible
  }

  set show(value: boolean) {
    this.visible = value
    if (this.layer) this.layer.show = value
    if (this.speedLayer) this.speedLayer.show = value
  }

  get data(): WindGrid {
    return this.grid
  }

  add(): void {
    if (this.destroyed || this.added) return
    this.disableRequestRenderMode()
    this.layer = this.createRawLayer()
    this.layer.show = this.visible
    this.updateSpeedOverlay()
    this.added = true
    this.viewer.scene.requestRender()
  }

  remove(): void {
    const layer = this.layer
    this.layer = null
    this.added = false
    this.removeSpeedOverlay()
    if (!layer) return
    try {
      layer.destroy()
    } finally {
      this.releaseCapturedListeners()
      this.restoreRequestRenderMode()
    }
  }

  updateData(grid: WindGrid): void {
    if (this.destroyed) return
    this.grid = grid
    this.layer?.updateWindData(toRawWindData(grid))
    this.updateSpeedOverlay()
    this.viewer.scene.requestRender()
  }

  updateOptions(options: Partial<WindFieldLayerOptions>): void {
    if (this.destroyed) return
    this.options = { ...this.options, ...definedOptions(options) }
    this.layer?.updateOptions(this.toRawOptions())
    this.updateSpeedOverlay()
    this.viewer.scene.requestRender()
  }

  getDataAtLonLat(lon: number, lat: number): WindSample | null {
    return interpolateWind(this.grid, lon, lat)
  }

  zoomTo(duration = 0): void {
    this.layer?.zoomTo(duration)
  }

  isDestroyed(): boolean {
    return this.destroyed
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.remove()
    this.releaseCapturedListeners()
    this.restoreRequestRenderMode()
    this.viewer.scene.requestRender()
  }

  /** Cesium Primitive 接口要求，风场内部图元由库自行驱动。 */
  update(): void {
    // no-op
  }

  /**
   * cesium-wind-layer 在构造时注册 camera/morph/window 监听，
   * 但其 removeEventListeners 使用了新的 bind 函数，无法真正移除。
   * 这里在构造期间捕获监听器，销毁时补一次移除，避免启停泄漏。
   */
  private createRawLayer(): WindLayer {
    const captured: Array<() => void> = []
    const restore: Array<() => void> = []

    const patchEvent = (event: unknown): void => {
      const target = event as ListenerTarget
      const original = target.addEventListener
      target.addEventListener = (listener, scope) => {
        captured.push(() => target.removeEventListener(listener, scope))
        original.call(target, listener, scope)
      }
      restore.push(() => {
        target.addEventListener = original
      })
    }

    patchEvent(this.viewer.camera.changed)
    patchEvent(this.viewer.scene.morphComplete)

    const originalWindowAdd = window.addEventListener
    const patchedWindowAdd = ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions
    ): void => {
      captured.push(() => window.removeEventListener(type, listener, options))
      originalWindowAdd.call(window, type, listener, options)
    }) as typeof window.addEventListener
    window.addEventListener = patchedWindowAdd
    restore.push(() => {
      window.addEventListener = originalWindowAdd
    })

    try {
      return new WindLayer(this.viewer, toRawWindData(this.grid), this.toRawOptions())
    } finally {
      restore.forEach((fn) => fn())
      this.capturedListeners = captured
    }
  }

  private releaseCapturedListeners(): void {
    const listeners = this.capturedListeners
    this.capturedListeners = []
    for (let i = listeners.length - 1; i >= 0; i -= 1) {
      try {
        listeners[i]?.()
      } catch {
        // 清理失败不应阻断后续回收
      }
    }
  }


  private updateSpeedOverlay(): void {
    this.removeSpeedOverlay()
    if (
      !this.options.showSpeedOverlay ||
      this.destroyed ||
      this.viewer.isDestroyed()
    ) {
      return
    }
    const canvas = this.createSpeedCanvas()
    if (!canvas) return
    const bounds = this.grid.bounds
    const provider = new Cesium.SingleTileImageryProvider({
      url: canvas.toDataURL('image/png'),
      tileWidth: canvas.width,
      tileHeight: canvas.height,
      rectangle: Cesium.Rectangle.fromDegrees(
        bounds.west,
        bounds.south,
        bounds.east,
        bounds.north
      )
    })
    const layer = this.viewer.imageryLayers.addImageryProvider(provider)
    layer.alpha = this.options.speedOverlayAlpha ?? 0.4
    layer.show = this.visible
    this.speedLayer = layer
  }

  private removeSpeedOverlay(): void {
    const layer = this.speedLayer
    this.speedLayer = null
    if (layer && !this.viewer.isDestroyed()) {
      this.viewer.imageryLayers.remove(layer, true)
    }
  }

  private createSpeedCanvas(): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null
    const { width, height } = this.grid
    const u = toFloat32Array(this.grid.u)
    const v = toFloat32Array(this.grid.v)
    const speed = this.grid.speed ? toFloat32Array(this.grid.speed) : undefined
    const values = new Float32Array(width * height)
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    for (let i = 0; i < values.length; i += 1) {
      const value = speed
        ? (speed[i] ?? 0)
        : Math.hypot(u[i] ?? 0, v[i] ?? 0)
      values[i] = value
      if (value < min) min = value
      if (value > max) max = value
    }
    const range = max - min || 1
    const colors = (
      this.options.speedOverlayColors ?? DEFAULT_OPTIONS.speedOverlayColors
    ).map((color) => Cesium.Color.fromCssColorString(color))

    const source = document.createElement('canvas')
    source.width = width
    source.height = height
    const context = source.getContext('2d')
    if (!context) return null
    const image = context.createImageData(width, height)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const value = values[y * width + x] ?? 0
        const color = sampleRamp(colors, (value - min) / range)
        const index = ((height - 1 - y) * width + x) * 4
        image.data[index] = Math.round(color.red * 255)
        image.data[index + 1] = Math.round(color.green * 255)
        image.data[index + 2] = Math.round(color.blue * 255)
        image.data[index + 3] = 255
      }
    }
    context.putImageData(image, 0, 0)

    const scale = 8
    const target = document.createElement('canvas')
    target.width = width * scale
    target.height = height * scale
    const targetContext = target.getContext('2d')
    if (!targetContext) return null
    targetContext.imageSmoothingEnabled = true
    targetContext.drawImage(source, 0, 0, target.width, target.height)
    return target
  }

  private toRawOptions(): Partial<RawWindLayerOptions> {
    return {
      particlesTextureSize: this.options.particlesTextureSize,
      particleHeight: this.options.particleHeight,
      lineWidth: this.options.lineWidth,
      lineLength: this.options.lineLength,
      speedFactor: this.options.speedFactor,
      dropRate: this.options.dropRate,
      dropRateBump: this.options.dropRateBump,
      colors: this.options.colors,
      flipY: this.options.flipY,
      useViewerBounds: this.options.useViewerBounds,
      domain: this.options.domain,
      displayRange: this.options.displayRange,
      dynamic: this.options.dynamic
    }
  }

  private disableRequestRenderMode(): void {
    const scene = this.viewer.scene
    if (scene.requestRenderMode) {
      this.previousRequestRenderMode = scene.requestRenderMode
      scene.requestRenderMode = false
    }
  }

  private restoreRequestRenderMode(): void {
    if (this.previousRequestRenderMode === undefined) return
    this.viewer.scene.requestRenderMode = this.previousRequestRenderMode
    this.previousRequestRenderMode = undefined
  }
}
