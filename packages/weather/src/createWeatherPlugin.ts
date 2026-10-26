import type { CesiumFeature, FeatureContext } from '@sgyx/cesium-kit-core'
import { clampRange, intersectRanges, toDate } from './data/time'
import {
  createWeatherRasterFeature,
  type WeatherRasterFeature,
  type WeatherRasterFeatureOptions
} from './features/createWeatherRasterFeature'
import {
  createWeatherPointFeature,
  type WeatherPointFeature,
  type WeatherPointFeatureOptions
} from './features/createWeatherPointFeature'
import {
  createWeatherWarningFeature,
  type WeatherWarningFeature,
  type WeatherWarningFeatureOptions
} from './features/createWeatherWarningFeature'
import type {
  WeatherFrame,
  WeatherLayerData,
  WeatherLayerKind,
  WeatherTimeRange
} from './shared/types'

export type WeatherPluginErrorKey = WeatherLayerKind | 'points' | 'warnings'

export interface WeatherPluginConfig {
  /** 天气图层；至少提供一项 */
  layers: WeatherRasterFeatureOptions[]
  /** 点预报；传 false 表示不启用 */
  points?: WeatherPointFeatureOptions | false
  /** 气象预警；传 false 表示不启用 */
  warnings?: WeatherWarningFeatureOptions | false
  /** 插件名，默认 weather-plugin */
  name?: string
  /** 全局时间范围，会覆盖到所有图层 */
  timeRange?: [Date | string, Date | string]
  /** 是否跟随 ClockService，默认 true */
  followClock?: boolean
  /** 是否同步 ClockService 时间范围，默认 false */
  syncClockRange?: boolean
  /** 隐藏图层是否延迟到首次显示时加载，默认 false */
  lazy?: boolean
  /** 单图层失败时是否继续加载其他图层，默认 false */
  continueOnError?: boolean
  onLayerError?: (key: WeatherPluginErrorKey, error: unknown) => void
  onLayerLoaded?: (key: WeatherPluginErrorKey) => void
  onFrameChange?: (kind: WeatherLayerKind, frame: WeatherFrame) => void
  onTimeRangeChange?: (range: WeatherTimeRange | null) => void
}

export interface WeatherPlugin extends CesiumFeature<WeatherPluginConfig> {
  readonly layers: Partial<Record<WeatherLayerKind, WeatherRasterFeature>>
  readonly points: WeatherPointFeature | null
  readonly warnings: WeatherWarningFeature | null
  readonly errors: Partial<Record<WeatherPluginErrorKey, unknown>>
  setLayerVisible(kind: WeatherLayerKind, visible: boolean): void | Promise<void>
  setLayerAlpha(kind: WeatherLayerKind, alpha: number): void
  setPointsVisible(visible: boolean): void
  setWarningsVisible(visible: boolean): void
  setFollowClock(enabled: boolean): void
  setTime(time: Date): void
  setTimeRange(start: Date | string, end: Date | string): void
  getTimeRange(): WeatherTimeRange | null
  getAvailableRange(): WeatherTimeRange | null
  getCurrentFrame(kind: WeatherLayerKind): WeatherFrame | null
  getValueAt(kind: WeatherLayerKind, lon: number, lat: number): number | null
  refresh(): Promise<void>
  updateLayerData(kind: WeatherLayerKind, data: WeatherLayerData | string): Promise<void>
}

function normalizeRange(
  value: [Date | string, Date | string] | undefined
): WeatherTimeRange | null {
  if (!value) return null
  const start = toDate(value[0])
  const end = toDate(value[1])
  return end.getTime() >= start.getTime() ? { start, end } : { start: end, end: start }
}

function intersectFeatureRanges(features: WeatherRasterFeature[]): WeatherTimeRange | null {
  return intersectRanges(features.map((feature) => ({ frames: feature.frames })))
}

/**
 * 组合多个天气栅格图层的插件。
 *
 * 每个子图层仍然可以单独导出使用；组合插件负责统一时间范围、懒加载和显隐控制。
 */
export function createWeatherPlugin(config: WeatherPluginConfig): WeatherPlugin {
  const features = new Map<WeatherLayerKind, WeatherRasterFeature>()
  const layerConfigs = new Map<WeatherLayerKind, WeatherRasterFeatureOptions>()
  const errors: Partial<Record<WeatherPluginErrorKey, unknown>> = {}
  let pointsFeature: WeatherPointFeature | null = null
  let warningsFeature: WeatherWarningFeature | null = null
  let activeRange: WeatherTimeRange | null = null
  let availableRange: WeatherTimeRange | null = null
  let ctxRef: FeatureContext | null = null
  let clock: FeatureContext['clock'] | null = null
  let syncClockRange = false
  let followClock = true
  let lazy = false
  let continueOnError = false
  let disposed = false
  let activeConfig: WeatherPluginConfig = config

  const reportError = (
    key: WeatherPluginErrorKey,
    error: unknown,
    merged: WeatherPluginConfig
  ): void => {
    errors[key] = error
    merged.onLayerError?.(key, error)
    if (!continueOnError) throw error
  }

  const frameCallback = (merged: WeatherPluginConfig, layerConfig: WeatherRasterFeatureOptions) => {
    return (kind: WeatherLayerKind, frame: WeatherFrame): void => {
      layerConfig.onFrameChange?.(kind, frame)
      merged.onFrameChange?.(kind, frame)
    }
  }

  const recomputeRange = (merged: WeatherPluginConfig): void => {
    const loaded = Array.from(features.values())
    availableRange = intersectFeatureRanges(loaded)
    if (availableRange) {
      activeRange = activeRange
        ? clampRange(activeRange, availableRange)
        : { start: new Date(availableRange.start), end: new Date(availableRange.end) }
      loaded.forEach((feature) => {
        feature.setTimeRange(activeRange!.start, activeRange!.end)
      })
      if (syncClockRange && clock) {
        clock.setRange(activeRange.start, activeRange.end)
      }
    } else {
      activeRange = null
    }
    merged.onTimeRangeChange?.(
      activeRange ? { start: new Date(activeRange.start), end: new Date(activeRange.end) } : null
    )
  }

  const installLayer = async (
    kind: WeatherLayerKind,
    merged: WeatherPluginConfig
  ): Promise<WeatherRasterFeature | null> => {
    const existing = features.get(kind)
    if (existing) return existing
    const layerConfig = layerConfigs.get(kind)
    if (!layerConfig || !ctxRef) return null

    const feature = createWeatherRasterFeature({
      ...layerConfig,
      followClock,
      syncClockRange: false,
      onFrameChange: frameCallback(merged, layerConfig)
    })
    try {
      await feature.install(ctxRef, {
        ...layerConfig,
        followClock,
        syncClockRange: false,
        onFrameChange: frameCallback(merged, layerConfig)
      })
      if (disposed) {
        feature.dispose?.()
        return null
      }
      features.set(kind, feature)
      delete errors[kind]
      merged.onLayerLoaded?.(kind)
      return feature
    } catch (error) {
      feature.dispose?.()
      reportError(kind, error, merged)
      return null
    }
  }

  const installOptional = async (
    key: 'points' | 'warnings',
    merged: WeatherPluginConfig
  ): Promise<void> => {
    if (!ctxRef) return
    try {
      if (key === 'points' && merged.points) {
        const feature = createWeatherPointFeature(merged.points)
        await feature.install(ctxRef, merged.points)
        if (disposed) {
          feature.dispose?.()
          return
        }
        pointsFeature = feature
        merged.onLayerLoaded?.('points')
      }
      if (key === 'warnings' && merged.warnings) {
        const feature = createWeatherWarningFeature(merged.warnings)
        await feature.install(ctxRef, merged.warnings)
        if (disposed) {
          feature.dispose?.()
          return
        }
        warningsFeature = feature
        merged.onLayerLoaded?.('warnings')
      }
    } catch (error) {
      reportError(key, error, merged)
    }
  }

  const install = async (ctx: FeatureContext, options?: WeatherPluginConfig): Promise<void> => {
    disposed = false
    ctxRef = ctx
    clock = ctx.clock
    const merged: WeatherPluginConfig = { ...config, ...options }
    activeConfig = merged
    lazy = merged.lazy ?? false
    continueOnError = merged.continueOnError ?? false
    followClock = merged.followClock ?? true
    syncClockRange = merged.syncClockRange ?? false
    activeRange = normalizeRange(merged.timeRange)
    availableRange = null
    features.clear()
    layerConfigs.clear()
    Object.keys(errors).forEach((key) => {
      delete errors[key as WeatherPluginErrorKey]
    })

    merged.layers.forEach((layerConfig) => {
      layerConfigs.set(layerConfig.kind, layerConfig)
    })

    try {
      for (const layerConfig of merged.layers) {
        if (lazy && layerConfig.visible !== true) continue
        await installLayer(layerConfig.kind, merged)
      }
      if (merged.points) await installOptional('points', merged)
      if (merged.warnings) await installOptional('warnings', merged)
    } catch (error) {
      features.forEach((feature) => feature.dispose?.())
      features.clear()
      pointsFeature?.dispose?.()
      warningsFeature?.dispose?.()
      pointsFeature = null
      warningsFeature = null
      throw error
    }

    recomputeRange(merged)
    ctx.log.info(`天气插件已启用：${Array.from(features.keys()).join(', ') || '无已加载图层'}`)
  }

  const plugin: WeatherPlugin = {
    name: config.name ?? 'weather-plugin',
    get layers() {
      return Object.fromEntries(features) as Partial<Record<WeatherLayerKind, WeatherRasterFeature>>
    },
    get points() {
      return pointsFeature
    },
    get warnings() {
      return warningsFeature
    },
    get errors() {
      return { ...errors }
    },
    install,
    setLayerVisible(kind, visible) {
      const feature = features.get(kind)
      if (feature) {
        feature.setVisible(visible)
        return
      }
      if (!visible || !layerConfigs.has(kind) || !ctxRef) return
      return installLayer(kind, activeConfig).then((loaded) => {
        if (!loaded) return
        loaded.setVisible(true)
        recomputeRange(activeConfig)
      })
    },
    setLayerAlpha(kind, alpha) {
      features.get(kind)?.setAlpha(alpha)
    },
    setPointsVisible(visible) {
      pointsFeature?.setVisible(visible)
    },
    setWarningsVisible(visible) {
      warningsFeature?.setVisible(visible)
    },
    setFollowClock(enabled) {
      followClock = enabled
      features.forEach((feature) => feature.setFollowClock(enabled))
    },
    setTime(time: Date) {
      if (clock) clock.seek(time)
    },
    setTimeRange(start: Date | string, end: Date | string) {
      const from = toDate(start)
      const to = toDate(end)
      const range =
        from.getTime() <= to.getTime() ? { start: from, end: to } : { start: to, end: from }
      activeRange = clampRange(range, availableRange)
      if (!activeRange) return
      features.forEach((feature) => {
        feature.setTimeRange(activeRange!.start, activeRange!.end)
      })
      if (syncClockRange && clock) {
        clock.setRange(activeRange.start, activeRange.end)
      }
      activeConfig.onTimeRangeChange?.(
        activeRange ? { start: new Date(activeRange.start), end: new Date(activeRange.end) } : null
      )
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
    async refresh() {
      const loaded = Array.from(features.values())
      for (const feature of loaded) {
        try {
          await feature.refresh()
        } catch (error) {
          reportError(feature.kind, error, activeConfig)
        }
      }
    },
    async updateLayerData(kind, data) {
      const configEntry = layerConfigs.get(kind)
      if (configEntry) configEntry.data = data
      const feature = features.get(kind)
      if (feature) {
        await feature.updateData(data)
        return
      }
      const loaded = await installLayer(kind, activeConfig)
      if (loaded) loaded.setVisible(true)
    },
    dispose() {
      disposed = true
      features.forEach((feature) => feature.dispose?.())
      features.clear()
      pointsFeature?.dispose?.()
      warningsFeature?.dispose?.()
      pointsFeature = null
      warningsFeature = null
      layerConfigs.clear()
      activeRange = null
      availableRange = null
      clock = null
      ctxRef = null
    }
  }

  return plugin
}
