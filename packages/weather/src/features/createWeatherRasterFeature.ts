import type { CesiumFeature, FeatureContext } from '@cesium-kit/core'
import { loadWeatherLayer } from '../data/loadWeather'
import {
  clampRange,
  findFrameIndexInRange,
  framesRange,
  toDate
} from '../data/time'
import { RasterWeatherLayer, type RasterWeatherLayerOptions } from '../layers/RasterWeatherLayer'
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
}

export interface WeatherRasterFeature extends CesiumFeature<WeatherRasterFeatureOptions> {
  readonly kind: WeatherLayerKind
  readonly layer: RasterWeatherLayer | null
  readonly data: WeatherLayerData | null
  readonly frames: WeatherFrame[]
  setVisible(visible: boolean): void
  setAlpha(alpha: number): void
  setTime(time: Date): void
  setTimeRange(start: Date | string, end: Date | string): void
  getTimeRange(): WeatherTimeRange | null
  getAvailableRange(): WeatherTimeRange | null
  getCurrentFrame(): WeatherFrame | null
  getValueAt(lon: number, lat: number): number | null
  zoomTo(duration?: number): void
}

function layerOptions(options: WeatherRasterFeatureOptions): RasterWeatherLayerOptions {
  return {
    visible: options.visible,
    alpha: options.alpha,
    colors: options.colors,
    min: options.min,
    max: options.max,
    scale: options.scale,
    canvasScale: options.canvasScale
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
  let frames: WeatherFrame[] = []
  let activeRange: WeatherTimeRange | null = null
  let availableRange: WeatherTimeRange | null = null
  let currentIndex = -1
  let followClock = true
  let syncClockRange = false
  let unsubscribeTick: (() => void) | undefined
  let clock: FeatureContext['clock'] | null = null
  let disposed = false

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
  }

  const install = async (
    ctx: FeatureContext,
    options?: WeatherRasterFeatureOptions
  ): Promise<void> => {
    disposed = false
    clock = ctx.clock
    const merged: WeatherRasterFeatureOptions = { ...defaultOptions, ...options }
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

    const initialTime = ctx.clock.state.currentTime
    currentIndex = findFrameIndexInRange(
      frames,
      activeRange && initialTime < activeRange.start ? activeRange.start : initialTime,
      activeRange ?? undefined
    )
    const initialFrame = currentFrame()
    if (!initialFrame) throw new Error('@cesium-kit/weather: 找不到可用时间帧')

    layer = new RasterWeatherLayer(ctx.viewer, loaded, layerOptions(merged))
    ctx.layers.onDispose(() => layer?.destroy())
    layer.add()

    if (syncClockRange && activeRange) {
      ctx.clock.setRange(activeRange.start, activeRange.end)
    }
    if (merged.flyTo) layer.zoomTo(1.5)
    if (followClock) {
      unsubscribeTick = ctx.clock.onTick(({ currentTime }) => applyFrame(currentTime))
      ctx.layers.onDispose(() => unsubscribeTick?.())
    }

    ctx.log.info(
      `天气图层已加载：${loaded.kind}，${frames.length} 个时刻，${activeRange ? `${activeRange.start.toISOString()} ~ ${activeRange.end.toISOString()}` : '无范围'}`
    )
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
      if (layer) layer.show = visible
    },
    setAlpha(alpha: number) {
      if (layer) layer.alpha = alpha
    },
    setTime(time: Date) {
      if (clock) clock.seek(time)
      else applyFrame(time)
    },
    setTimeRange(start: Date | string, end: Date | string) {
      const from = toDate(start)
      const to = toDate(end)
      const range = from.getTime() <= to.getTime() ? { start: from, end: to } : { start: to, end: from }
      activeRange = clampRange(range, availableRange)
      if (syncClockRange && activeRange && clock) {
        clock.setRange(activeRange.start, activeRange.end)
      }
      const time = clock?.state.currentTime ?? activeRange?.start
      if (time) applyFrame(time)
    },
    getTimeRange() {
      return activeRange ? { start: new Date(activeRange.start), end: new Date(activeRange.end) } : null
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
    dispose() {
      disposed = true
      unsubscribeTick?.()
      unsubscribeTick = undefined
      layer?.destroy()
      layer = null
      currentIndex = -1
      clock = null
    }
  }

  return feature
}
