import type { CesiumFeature, FeatureContext } from '@cesium-kit/core'
import { clampRange, intersectRanges, toDate } from './data/time'
import {
  createWeatherRasterFeature,
  type WeatherRasterFeature,
  type WeatherRasterFeatureOptions
} from './features/createWeatherRasterFeature'
import type {
  WeatherFrame,
  WeatherLayerKind,
  WeatherTimeRange
} from './shared/types'

export interface WeatherPluginConfig {
  /** 天气图层；至少提供一项 */
  layers: WeatherRasterFeatureOptions[]
  /** 插件名，默认 weather-plugin */
  name?: string
  /** 全局时间范围，会覆盖到所有图层 */
  timeRange?: [Date | string, Date | string]
  /** 是否跟随 ClockService，默认 true */
  followClock?: boolean
  /** 是否同步 ClockService 时间范围，默认 false */
  syncClockRange?: boolean
}

export interface WeatherPlugin extends CesiumFeature<WeatherPluginConfig> {
  readonly layers: Partial<Record<WeatherLayerKind, WeatherRasterFeature>>
  setLayerVisible(kind: WeatherLayerKind, visible: boolean): void
  setLayerAlpha(kind: WeatherLayerKind, alpha: number): void
  setTime(time: Date): void
  setTimeRange(start: Date | string, end: Date | string): void
  getTimeRange(): WeatherTimeRange | null
  getAvailableRange(): WeatherTimeRange | null
  getCurrentFrame(kind: WeatherLayerKind): WeatherFrame | null
  getValueAt(kind: WeatherLayerKind, lon: number, lat: number): number | null
}

function normalizeRange(
  value: [Date | string, Date | string] | undefined
): WeatherTimeRange | null {
  if (!value) return null
  const start = toDate(value[0])
  const end = toDate(value[1])
  return end.getTime() >= start.getTime()
    ? { start, end }
    : { start: end, end: start }
}

function intersectFeatureRanges(features: WeatherRasterFeature[]): WeatherTimeRange | null {
  return intersectRanges(
    features.map((feature) => ({ frames: feature.frames }))
  )
}

/**
 * 组合多个天气栅格图层的插件。
 *
 * 每个子图层仍然可以单独导出使用；组合插件负责统一时间范围和显隐控制。
 */
export function createWeatherPlugin(config: WeatherPluginConfig): WeatherPlugin {
  const features = new Map<WeatherLayerKind, WeatherRasterFeature>()
  let activeRange: WeatherTimeRange | null = null
  let availableRange: WeatherTimeRange | null = null
  let clock: FeatureContext['clock'] | null = null
  let syncClockRange = false
  let disposed = false

  const install = async (
    ctx: FeatureContext,
    options?: WeatherPluginConfig
  ): Promise<void> => {
    disposed = false
    clock = ctx.clock
    const merged: WeatherPluginConfig = { ...config, ...options }
    const requestedRange = normalizeRange(merged.timeRange)
    syncClockRange = merged.syncClockRange ?? false

    const installed: WeatherRasterFeature[] = []
    try {
      for (const layerConfig of merged.layers) {
        const feature = createWeatherRasterFeature({
          ...layerConfig,
          followClock: merged.followClock ?? layerConfig.followClock ?? true,
          syncClockRange: false
        })
        await feature.install(ctx, {
          ...layerConfig,
          followClock: merged.followClock ?? layerConfig.followClock ?? true,
          syncClockRange: false,
          timeRange: requestedRange
            ? [requestedRange.start, requestedRange.end]
            : layerConfig.timeRange
        })
        if (disposed) {
          feature.dispose?.()
          return
        }
        installed.push(feature)
        features.set(feature.kind, feature)
      }
    } catch (error) {
      installed.forEach((feature) => feature.dispose?.())
      features.clear()
      throw error
    }

    availableRange = intersectFeatureRanges(installed)
    activeRange = requestedRange
      ? clampRange(requestedRange, availableRange)
      : availableRange

    if (activeRange) {
      const start = activeRange.start
      const end = activeRange.end
      installed.forEach((feature) => feature.setTimeRange(start, end))
    }
    if (syncClockRange && activeRange) {
      ctx.clock.setRange(activeRange.start, activeRange.end)
    }

    ctx.log.info(
      `天气插件已启用：${installed.map((feature) => feature.kind).join(', ')}`
    )
  }

  const plugin: WeatherPlugin = {
    name: config.name ?? 'weather-plugin',
    get layers() {
      return Object.fromEntries(features) as Partial<
        Record<WeatherLayerKind, WeatherRasterFeature>
      >
    },
    install,
    setLayerVisible(kind, visible) {
      features.get(kind)?.setVisible(visible)
    },
    setLayerAlpha(kind, alpha) {
      features.get(kind)?.setAlpha(alpha)
    },
    setTime(time: Date) {
      if (clock) clock.seek(time)
    },
    setTimeRange(start: Date | string, end: Date | string) {
      const from = toDate(start)
      const to = toDate(end)
      const range = from.getTime() <= to.getTime()
        ? { start: from, end: to }
        : { start: to, end: from }
      activeRange = clampRange(range, availableRange)
      if (!activeRange) return
      features.forEach((feature) => {
        feature.setTimeRange(activeRange!.start, activeRange!.end)
      })
      if (syncClockRange && clock) {
        clock.setRange(activeRange.start, activeRange.end)
      }
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
    getCurrentFrame(kind) {
      return features.get(kind)?.getCurrentFrame() ?? null
    },
    getValueAt(kind, lon, lat) {
      return features.get(kind)?.getValueAt(lon, lat) ?? null
    },
    dispose() {
      disposed = true
      features.forEach((feature) => feature.dispose?.())
      features.clear()
      activeRange = null
      availableRange = null
      clock = null
    }
  }

  return plugin
}
