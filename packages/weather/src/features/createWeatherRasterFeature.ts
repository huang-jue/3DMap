import type { CesiumFeature, FeatureContext } from '@cesium-kit/core'
import { loadWeatherLayer } from '../data/loadWeather'
import { clampRange, findFrameIndexInRange, framesRange, toDate } from '../data/time'
import { RasterWeatherLayer, type RasterWeatherLayerOptions } from '../layers/RasterWeatherLayer'
import { ensureWeatherLayerGroup } from '../shared/layerTree'
import type {
  WeatherFrame,
  WeatherLayerData,
  WeatherLayerKind,
  WeatherTimeRange
} from '../shared/types'

export interface WeatherRasterFeatureOptions extends RasterWeatherLayerOptions {
  kind: WeatherLayerKind
  /** 图层数据、JSON 字符串或 URL */
  data: WeatherLayerData | string
  /** 插件名，默认 weather-${kind} */
  name?: string
  /** 是否跟随 ClockService，默认 true */
  followClock?: boolean
  /** 是否把 ClockService 范围同步为当前时间范围，默认 false */
  syncClockRange?: boolean
  /** 可选时间范围，默认使用数据完整范围 */
  timeRange?: [Date | string, Date | string]
  /** 加载后是否飞到数据范围，默认 false */
  flyTo?: boolean
  /** 预加载后续帧数量，默认 1 */
  preload?: number
  /** 是否接入共享图层树，默认 true（存在 layerManager 时生效） */
  layerTree?: boolean
  /** 帧变化回调，用于宿主同步外部 UI */
  onFrameChange?: (kind: WeatherLayerKind, frame: WeatherFrame) => void
}

export interface WeatherRasterFeature extends CesiumFeature<WeatherRasterFeatureOptions> {
  readonly kind: WeatherLayerKind
  readonly layer: RasterWeatherLayer | null
  readonly data: WeatherLayerData | null
  readonly frames: WeatherFrame[]
  setVisible(visible: boolean): void
  setAlpha(alpha: number): void
  setFollowClock(enabled: boolean): void
  setTime(time: Date): void
  setTimeRange(start: Date | string, end: Date | string): void
  getTimeRange(): WeatherTimeRange | null
  getAvailableRange(): WeatherTimeRange | null
  getCurrentFrame(): WeatherFrame | null
  getValueAt(lon: number, lat: number): number | null
  zoomTo(duration?: number): void
  updateData(data: WeatherLayerData | string): Promise<void>
  refresh(): Promise<void>
}

function layerOptions(options: WeatherRasterFeatureOptions): RasterWeatherLayerOptions {
  return {
    visible: options.visible,
    alpha: options.alpha,
    colors: options.colors,
    min: options.min,
    max: options.max,
    scale: options.scale,
    canvasScale: options.canvasScale,
    crossfade: options.crossfade,
    crossfadeDuration: options.crossfadeDuration,
    onError: options.onError
  }
}

function normalizeRange(
  value: [Date | string, Date | string] | undefined
): WeatherTimeRange | null {
  if (!value) return null
  const start = toDate(value[0])
  const end = toDate(value[1])
  if (end.getTime() < start.getTime()) {
    return { start: end, end: start }
  }
  return { start, end }
}

/**
 * 创建单个天气栅格图层插件。
 *
 * 图层通过 `ctx.layers.onDispose` 回收；时间帧只在最近索引变化时更新。
 */
export function createWeatherRasterFeature(
  defaultOptions: WeatherRasterFeatureOptions
): WeatherRasterFeature {
  let layer: RasterWeatherLayer | null = null
  let data: WeatherLayerData | null = null
  let source: WeatherLayerData | string = defaultOptions.data
  let frames: WeatherFrame[] = []
  let activeRange: WeatherTimeRange | null = null
  let availableRange: WeatherTimeRange | null = null
  let currentIndex = -1
  let followClock = true
  let syncClockRange = false
  let preload = 1
  let unsubscribeTick: (() => void) | undefined
  let ctxRef: FeatureContext | null = null
  let clock: FeatureContext['clock'] | null = null
  let nodeId: string | undefined
  let visibleState = defaultOptions.visible ?? true
  let alphaState = defaultOptions.alpha ?? 0.85
  let disposed = false
  let optionsState: WeatherRasterFeatureOptions = defaultOptions

  const currentFrame = (): WeatherFrame | null =>
    currentIndex >= 0 ? (frames[currentIndex] ?? null) : null

  const applyFrame = (time: Date): void => {
    const index = findFrameIndexInRange(frames, time, activeRange ?? undefined)
    if (index < 0) return
    if (index === currentIndex) return
    const frame = frames[index]
    if (!frame) return
    currentIndex = index
    layer?.updateFrame(frame)
    optionsState.onFrameChange?.(defaultOptions.kind, frame)
    preloadAround(index)
  }

  const preloadAround = (index: number): void => {
    if (!layer || preload <= 0) return
    for (let offset = 1; offset <= preload; offset += 1) {
      const frame = frames[index + offset]
      if (frame) layer.preloadFrame(frame)
    }
  }

  const subscribeClock = (): void => {
    if (!ctxRef || !followClock || frames.length <= 1 || unsubscribeTick) return
    unsubscribeTick = ctxRef.clock.onTick(({ currentTime }) => applyFrame(currentTime))
  }

  const unsubscribeClock = (): void => {
    unsubscribeTick?.()
    unsubscribeTick = undefined
  }

  const install = async (
    ctx: FeatureContext,
    options?: WeatherRasterFeatureOptions
  ): Promise<void> => {
    disposed = false
    ctxRef = ctx
    clock = ctx.clock
    const merged: WeatherRasterFeatureOptions = { ...defaultOptions, ...options }
    optionsState = merged
    source = merged.data
    const loaded = await loadWeatherLayer(merged.data)
    if (disposed) return
    if (loaded.frames.length === 0) {
      throw new Error('@cesium-kit/weather: 图层数据为空')
    }

    data = loaded
    frames = loaded.frames
    availableRange = framesRange(frames)
    const requested = normalizeRange(merged.timeRange)
    activeRange = requested ? clampRange(requested, availableRange) : availableRange
    followClock = merged.followClock ?? true
    syncClockRange = merged.syncClockRange ?? false
    preload = Math.max(0, Math.min(5, merged.preload ?? 1))
    visibleState = merged.visible ?? loaded.defaultVisible ?? true
    alphaState = Math.min(1, Math.max(0, merged.alpha ?? loaded.defaultAlpha ?? 0.85))

    const initialTime = ctx.clock.state.currentTime
    currentIndex = findFrameIndexInRange(
      frames,
      activeRange && initialTime < activeRange.start ? activeRange.start : initialTime,
      activeRange ?? undefined
    )
    const initialFrame = currentFrame()
    if (!initialFrame) throw new Error('@cesium-kit/weather: 找不到可用时间帧')

    layer = new RasterWeatherLayer(ctx.viewer, loaded, {
      ...layerOptions(merged),
      visible: visibleState,
      alpha: alphaState
    })
    ctx.layers.onDispose(() => layer?.destroy())
    layer.add()
    layer.updateFrame(initialFrame)

    if (ctx.layerManager && merged.layerTree !== false) {
      try {
        nodeId = ctx.layerManager.addCustom(loaded.name ?? loaded.kind, {
          id: `weather-layer:${loaded.kind}`,
          parentId: ensureWeatherLayerGroup(ctx),
          visible: visibleState,
          alpha: alphaState,
          handle: {
            setVisible: (visible) => {
              visibleState = visible
              if (layer) layer.show = visible
            },
            setAlpha: (alpha) => {
              alphaState = alpha
              if (layer) layer.alpha = alpha
            },
            raiseToTop: () => {
              const imageryLayer = layer?.renderLayer
              if (imageryLayer && !ctx.viewer.isDestroyed()) {
                ctx.viewer.imageryLayers.raiseToTop(imageryLayer)
              }
            },
            destroy: () => {
              layer?.destroy()
              layer = null
            }
          }
        }).id
      } catch (error) {
        ctx.log.warn('天气图层接入图层树失败', error)
      }
    }
    optionsState.onFrameChange?.(loaded.kind, initialFrame)
    preloadAround(currentIndex)

    if (syncClockRange && activeRange) {
      ctx.clock.setRange(activeRange.start, activeRange.end)
    }
    subscribeClock()
    if (merged.flyTo) layer.zoomTo(1.5)

    ctx.log.info(
      `天气图层已加载：${loaded.kind}，${frames.length} 个时刻，${activeRange ? `${activeRange.start.toISOString()} ~ ${activeRange.end.toISOString()}` : '无范围'}`
    )
  }

  const updateData = async (nextData: WeatherLayerData | string): Promise<void> => {
    source = nextData
    const loaded = await loadWeatherLayer(nextData)
    if (disposed || !ctxRef) return
    if (loaded.frames.length === 0) {
      throw new Error('@cesium-kit/weather: 图层数据为空')
    }
    data = loaded
    frames = loaded.frames
    availableRange = framesRange(frames)
    activeRange = clampRange(
      activeRange ?? availableRange ?? { start: new Date(), end: new Date() },
      availableRange
    )
    currentIndex = findFrameIndexInRange(
      frames,
      clock?.state.currentTime ?? new Date(),
      activeRange ?? undefined
    )

    const previous = layer
    layer = new RasterWeatherLayer(ctxRef.viewer, loaded, {
      ...layerOptions(optionsState),
      visible: visibleState,
      alpha: alphaState
    })
    layer.add()
    const frame = currentFrame()
    if (frame) {
      layer.updateFrame(frame)
      optionsState.onFrameChange?.(loaded.kind, frame)
      preloadAround(currentIndex)
    }
    previous?.destroy()
    if (syncClockRange && activeRange && clock) {
      clock.setRange(activeRange.start, activeRange.end)
    }
  }

  const feature: WeatherRasterFeature = {
    name: defaultOptions.name ?? `weather-${defaultOptions.kind}`,
    get kind() {
      return defaultOptions.kind
    },
    get layer() {
      return layer
    },
    get data() {
      return data
    },
    get frames() {
      return frames
    },
    install,
    setVisible(visible: boolean) {
      visibleState = visible
      if (layer) layer.show = visible
      if (nodeId) ctxRef?.layerManager?.setVisible(nodeId, visible)
    },
    setAlpha(alpha: number) {
      alphaState = Math.min(1, Math.max(0, alpha))
      if (layer) layer.alpha = alphaState
      if (nodeId) ctxRef?.layerManager?.setAlpha(nodeId, alphaState)
    },
    setFollowClock(enabled: boolean) {
      followClock = enabled
      if (enabled) subscribeClock()
      else unsubscribeClock()
    },
    setTime(time: Date) {
      if (clock) clock.seek(time)
      else applyFrame(time)
    },
    setTimeRange(start: Date | string, end: Date | string) {
      const from = toDate(start)
      const to = toDate(end)
      const range =
        from.getTime() <= to.getTime() ? { start: from, end: to } : { start: to, end: from }
      activeRange = clampRange(range, availableRange)
      if (syncClockRange && activeRange && clock) {
        clock.setRange(activeRange.start, activeRange.end)
      }
      const time = clock?.state.currentTime ?? activeRange?.start
      if (time) applyFrame(time)
    },
    getTimeRange() {
      return activeRange
        ? { start: new Date(activeRange.start), end: new Date(activeRange.end) }
        : null
    },
    getAvailableRange() {
      return availableRange
        ? { start: new Date(availableRange.start), end: new Date(availableRange.end) }
        : null
    },
    getCurrentFrame() {
      return currentFrame()
    },
    getValueAt(lon: number, lat: number) {
      return layer?.getValueAt(lon, lat) ?? null
    },
    zoomTo(duration = 0) {
      layer?.zoomTo(duration)
    },
    updateData,
    async refresh() {
      await updateData(source)
    },
    dispose() {
      disposed = true
      unsubscribeClock()
      if (nodeId && ctxRef?.layerManager?.get(nodeId)) {
        ctxRef.layerManager.remove(nodeId, { removeSource: false })
      }
      nodeId = undefined
      layer?.destroy()
      layer = null
      currentIndex = -1
      clock = null
      ctxRef = null
    }
  }

  return feature
}
