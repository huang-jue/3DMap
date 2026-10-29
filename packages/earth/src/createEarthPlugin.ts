import * as Cesium from 'cesium'
import type { CesiumFeature, FeatureContext } from '@sgyx/cesium-kit-core'
import {
  createWeatherPointFeature,
  createWeatherWarningFeature,
  type WeatherPointFeature,
  type WeatherWarningFeature
} from '@sgyx/cesium-kit-weather'
import { createWindFarmFeature, type WindFarmFeature } from '@sgyx/cesium-kit-wind'
import { samplePointSeries } from './data/pointSeries'
import { validateEarthState } from './data/validateEarthState'
import type { DataRequestOptions } from '@sgyx/cesium-kit-core'
import { loadEarthManifest } from './data/loadEarthData'
import { loadEarthCoastline } from './layers/EarthCoastlineLayer'
import {
  createEarthAnnotationFeature,
  type EarthAnnotationFeature
} from './features/createEarthAnnotationFeature'
import { createEarthProbeFeature, type EarthProbeFeature } from './features/createEarthProbeFeature'
import {
  createEarthScalarFeature,
  type EarthScalarFeature
} from './features/createEarthScalarFeature'
import {
  createEarthVectorFeature,
  type EarthVectorFeature
} from './features/createEarthVectorFeature'
import {
  DEFAULT_EARTH_SETTINGS,
  type EarthPluginState,
  type EarthPointSeries,
  type EarthAnnotationItem,
  type EarthLegend,
  type EarthLevelConfig,
  type EarthManifest,
  type EarthMode,
  type EarthModeConfig,
  type EarthOverlayConfig,
  type EarthProbeResult,
  type EarthProjection,
  type EarthSettings,
  type EarthVectorConfig
} from './shared/types'

export interface EarthPluginConfig {
  data: EarthManifest | string
  name?: string
  dataRef?: string
  mode?: EarthMode
  level?: string
  vector?: string | null
  overlay?: string | null
  annotations?: string[]
  visible?: boolean
  followClock?: boolean
  syncClockRange?: boolean
  settings?: Partial<EarthSettings>
  weather?: boolean
  onProbe?: (result: EarthProbeResult | null) => void
  onHover?: (result: EarthProbeResult | null) => void
  onModeChange?: (mode: EarthModeConfig) => void
  onError?: (key: string, error: unknown) => void
}

export interface EarthPlugin extends CesiumFeature<EarthPluginConfig> {
  install(ctx: FeatureContext, options?: EarthPluginConfig): Promise<void>
  readonly manifest: EarthManifest | null
  readonly mode: EarthModeConfig | null
  readonly level: EarthLevelConfig | null
  readonly overlay: EarthOverlayConfig | null
  readonly vector: EarthVectorConfig | null
  readonly settings: EarthSettings
  readonly errors: Partial<Record<string, unknown>>
  readonly annotations: EarthAnnotationFeature[]
  readonly weatherPoints: WeatherPointFeature | null
  readonly weatherWarnings: WeatherWarningFeature | null
  readonly windFarm: WindFarmFeature | null
  setMode(mode: EarthMode): Promise<void>
  setLevel(id: string): Promise<void>
  setOverlay(id: string | null): Promise<void>
  setVector(id: string | null): Promise<void>
  setAnnotation(id: string, visible: boolean): void | Promise<void>
  setWeatherPointsVisible(visible: boolean): void | Promise<void>
  setWeatherWarningsVisible(visible: boolean): void | Promise<void>
  setWindFarmVisible(visible: boolean): void | Promise<void>
  setProjection(projection: EarthProjection): void
  setTime(time: Date): void
  setTimeRange(start: Date, end: Date): void
  setFollowClock(enabled: boolean): void
  setSettings(settings: Partial<EarthSettings>): void
  probe(lon: number, lat: number): EarthProbeResult
  getLegend(): EarthLegend | null
  getState(): EarthPluginState
  restoreState(state: EarthPluginState): Promise<void>
  getPointSeries(lon: number, lat: number, options?: DataRequestOptions): Promise<EarthPointSeries>
  readonly sampledTime: Date | null
  readonly frameTimes: Date[]
}

function overlayById(
  mode: EarthLevelConfig,
  id: string | null | undefined
): EarthOverlayConfig | null {
  if (!id) return null
  return mode.overlays.find((item) => item.id === id) ?? null
}

function vectorById(
  mode: EarthLevelConfig,
  id: string | null | undefined
): EarthVectorConfig | null {
  if (!id) return null
  return mode.vectors.find((item) => item.id === id) ?? null
}

function annotationItemsNear(
  items: EarthAnnotationItem[],
  lon: number,
  lat: number
): EarthAnnotationItem[] {
  return items.filter((item) => {
    if (item.type === 'point' && item.lon !== undefined && item.lat !== undefined) {
      return Math.hypot(item.lon - lon, item.lat - lat) < 2
    }
    if (item.geometry) {
      const ring =
        item.geometry.type === 'Polygon'
          ? item.geometry.coordinates[0]
          : item.geometry.coordinates[0]?.[0]
      if (!ring || ring.length === 0) return false
      const lons = ring.map((point) => point[0] ?? 0)
      const lats = ring.map((point) => point[1] ?? 0)
      return (
        lon >= Math.min(...lons) &&
        lon <= Math.max(...lons) &&
        lat >= Math.min(...lats) &&
        lat <= Math.max(...lats)
      )
    }
    return false
  })
}

/** 全球地球可视化组合插件。 */
export function createEarthPlugin(config: EarthPluginConfig): EarthPlugin {
  let manifest: EarthManifest | null = null
  let mode: EarthModeConfig | null = null
  let level: EarthLevelConfig | null = null
  let overlayConfig: EarthOverlayConfig | null = null
  let vectorConfig: EarthVectorConfig | null = null
  let scalarFeature: EarthScalarFeature | null = null
  let vectorFeature: EarthVectorFeature | null = null
  let probeFeature: EarthProbeFeature | null = null
  let annotationFeatures: EarthAnnotationFeature[] = []
  let weatherPoints: WeatherPointFeature | null = null
  let weatherWarnings: WeatherWarningFeature | null = null
  let windFarm: WindFarmFeature | null = null
  let gridLayer: Cesium.ImageryLayer | null = null
  let coastLayer: Cesium.ImageryLayer | null = null
  let ctxRef: FeatureContext | null = null
  let settings: EarthSettings = { ...DEFAULT_EARTH_SETTINGS, ...config.settings }
  let followClock = true
  let visible = true
  let scalarRequest = 0
  let vectorRequest = 0
  let activeConfig: EarthPluginConfig = config
  let disposed = false
  let controller = new AbortController()
  let generation = 0
  let selectionRequest = 0
  let projection: EarthProjection = '3D'
  let pendingScalar: EarthScalarFeature | null = null
  let pendingVector: EarthVectorFeature | null = null
  const pendingBusiness = new Set<{ dispose?(): void }>()
  const pendingAnnotations = new Map<string, EarthAnnotationFeature>()
  const tasks = new Map<string, Promise<void>>()
  const weatherVisibility = { points: false, warnings: false, windFarm: false }
  const once = (key: string, action: () => Promise<void>): Promise<void> => {
    const existing = tasks.get(key)
    if (existing) return existing
    const pending = action().finally(() => {
      if (tasks.get(key) === pending) tasks.delete(key)
    })
    tasks.set(key, pending)
    return pending
  }
  const errors: Partial<Record<string, unknown>> = {}
  const annotationVisibility = new Map<string, boolean>()

  const report = (key: string, error: unknown): void => {
    if (disposed) return
    errors[key] = error
    activeConfig.onError?.(key, error)
  }

  const syncFieldTime = (overlay: EarthOverlayConfig | null): void => {
    if (!ctxRef || !manifest || activeConfig.syncClockRange === false) return
    const times = overlay?.metadata?.times
      .map((t) => new Date(t))
      .filter((t) => Number.isFinite(t.getTime()))
    const start = times?.length
      ? new Date(Math.min(...times.map((t) => t.getTime())))
      : manifest.range.start
    const end = times?.length
      ? new Date(Math.max(...times.map((t) => t.getTime())))
      : manifest.range.end
    const now = ctxRef.clock.state.currentTime.getTime()
    ctxRef.clock.setRange(start, end)
    if (end.getTime() === start.getTime()) ctxRef.clock.pause()
    ctxRef.clock.seek(new Date(Math.min(end.getTime(), Math.max(start.getTime(), now))))
  }

  const applyGrid = (): void => {
    if (!ctxRef) return
    if (settings.grid) {
      if (gridLayer || ctxRef.viewer.isDestroyed()) return
      const provider = new Cesium.GridImageryProvider({
        cells: 4,
        color: Cesium.Color.WHITE.withAlpha(0.28),
        glowColor: Cesium.Color.WHITE.withAlpha(0.06),
        backgroundColor: Cesium.Color.TRANSPARENT
      })
      gridLayer = ctxRef.viewer.imageryLayers.addImageryProvider(provider)
      gridLayer.alpha = 0.65
      gridLayer.show = visible
    } else if (gridLayer) {
      if (!ctxRef.viewer.isDestroyed()) {
        ctxRef.viewer.imageryLayers.remove(gridLayer, true)
      }
      gridLayer = null
    }
    ctxRef.viewer.scene.requestRender()
  }

  const disposeScalar = (): void => {
    pendingScalar?.dispose?.()
    pendingScalar = null
    scalarFeature?.dispose?.()
    scalarFeature = null
  }

  const disposeVector = (): void => {
    pendingVector?.dispose?.()
    pendingVector = null
    vectorFeature?.dispose?.()
    vectorFeature = null
  }

  const installScalar = async (overlay: EarthOverlayConfig | null): Promise<void> => {
    const request = ++scalarRequest
    if (!ctxRef) return
    disposeScalar()
    overlayConfig = overlay
    if (!overlay) {
      delete errors.scalar
      syncFieldTime(null)
      return
    }
    const feature = createEarthScalarFeature({
      overlay,
      followClock,
      visible,
      settings,
      name: `earth-scalar-${overlay.id}`
    })
    pendingScalar = feature
    try {
      await feature.install(ctxRef, {
        overlay,
        followClock,
        visible,
        settings
      })
      if (disposed || request !== scalarRequest) {
        feature.dispose?.()
        return
      }
      pendingScalar = null
      scalarFeature = feature
      syncFieldTime(overlay)
      // A newly installed scalar must stay below the transparent coastline/grid.
      if (coastLayer) ctxRef.viewer.imageryLayers.raiseToTop(coastLayer)
      if (gridLayer) ctxRef.viewer.imageryLayers.raiseToTop(gridLayer)
      delete errors.scalar
    } catch (error) {
      feature.dispose?.()
      if (request === scalarRequest) report('scalar', error)
    }
  }

  const installVector = async (vector: EarthVectorConfig | null): Promise<void> => {
    const request = ++vectorRequest
    if (vectorFeature && vector && vectorConfig?.data === vector.data) {
      vectorConfig = vector
      return
    }
    if (!ctxRef) return
    disposeVector()
    vectorConfig = vector
    if (!vector) {
      delete errors.vector
      return
    }
    const feature = createEarthVectorFeature({
      vector,
      followClock,
      visible,
      settings,
      name: `earth-vector-${vector.id}`
    })
    pendingVector = feature
    try {
      await feature.install(ctxRef, {
        vector,
        followClock,
        visible,
        settings
      })
      if (disposed || request !== vectorRequest) {
        feature.dispose?.()
        return
      }
      pendingVector = null
      vectorFeature = feature
      delete errors.vector
    } catch (error) {
      feature.dispose?.()
      if (request === vectorRequest) report('vector', error)
    }
  }

  const ensureAnnotation = async (
    id: string,
    visible = annotationVisibility.get(id) ?? false
  ): Promise<void> => {
    if (!manifest || !ctxRef) return
    const existing = annotationFeatures.find((feature) => feature.annotation.id === id)
    if (existing) {
      existing.setVisible(annotationVisibility.get(id) ?? false)
      return
    }
    const annotation = manifest.annotations.find((item) => item.id === id)
    if (!annotation) return
    const feature = createEarthAnnotationFeature({
      annotation,
      visible,
      name: `earth-annotation-${annotation.id}`
    })
    const current = generation
    pendingAnnotations.set(id, feature)
    try {
      await feature.install(ctxRef, { annotation, visible })
      if (disposed || current !== generation) {
        feature.dispose?.()
        return
      }
      pendingAnnotations.delete(id)
      feature.setVisible(annotationVisibility.get(id) ?? false)
      annotationFeatures.push(feature)
      delete errors[`annotation:${annotation.id}`]
    } catch (error) {
      feature.dispose?.()
      if (current === generation) report(`annotation:${annotation.id}`, error)
    } finally {
      if (pendingAnnotations.get(id) === feature) pendingAnnotations.delete(id)
    }
  }

  const ensureDefaultAnnotations = async (): Promise<void> => {
    for (const [id, visible] of annotationVisibility) {
      if (visible) await once(`annotation:${id}`, () => ensureAnnotation(id, false))
    }
  }

  const ensureWeatherPoints = async (): Promise<void> => {
    if (weatherPoints) return
    if (!manifest?.weather?.points || !ctxRef) throw new Error('当前数据集未配置城市预报数据')
    const points = createWeatherPointFeature({
      points: manifest.weather.points,
      time: manifest.weather.sampleTime,
      name: 'earth-weather-points',
      visible: false,
      showPopup: true
    })
    const current = generation
    pendingBusiness.add(points)
    try {
      await points.install(ctxRef, {
        points: manifest.weather.points,
        time: manifest.weather.sampleTime,
        name: 'earth-weather-points',
        visible: false,
        showPopup: true
      })
      if (disposed || current !== generation) points.dispose?.()
      else {
        weatherPoints = points
        points.setVisible(weatherVisibility.points)
      }
      pendingBusiness.delete(points)
      if (current === generation) delete errors['weather-points']
    } catch (error) {
      points.dispose?.()
      pendingBusiness.delete(points)
      if (current === generation) report('weather-points', error)
      throw error
    }
  }

  const ensureWeatherWarnings = async (): Promise<void> => {
    if (weatherWarnings) return
    if (!manifest?.weather?.warnings || !ctxRef) throw new Error('当前数据集未配置气象预警数据')
    const warnings = createWeatherWarningFeature({
      warnings: manifest.weather.warnings,
      time: manifest.weather.sampleTime,
      name: 'earth-weather-warnings',
      visible: false,
      showPopup: true
    })
    const current = generation
    pendingBusiness.add(warnings)
    try {
      await warnings.install(ctxRef, {
        warnings: manifest.weather.warnings,
        time: manifest.weather.sampleTime,
        name: 'earth-weather-warnings',
        visible: false,
        showPopup: true
      })
      if (disposed || current !== generation) warnings.dispose?.()
      else {
        weatherWarnings = warnings
        warnings.setVisible(weatherVisibility.warnings)
      }
      pendingBusiness.delete(warnings)
      if (current === generation) delete errors['weather-warnings']
    } catch (error) {
      warnings.dispose?.()
      pendingBusiness.delete(warnings)
      if (current === generation) report('weather-warnings', error)
      throw error
    }
  }

  const ensureWindFarm = async (): Promise<void> => {
    if (windFarm) return
    if (!manifest?.weather?.windFarm || !ctxRef) throw new Error('当前数据集未配置风电场数据')
    const farm = createWindFarmFeature({
      turbines: manifest.weather.windFarm,
      name: 'earth-wind-farm'
    })
    const current = generation
    pendingBusiness.add(farm)
    try {
      await farm.install(ctxRef, {
        turbines: manifest.weather.windFarm,
        name: 'earth-wind-farm'
      })
      if (disposed || current !== generation) farm.dispose?.()
      else {
        windFarm = farm
        farm.setVisible(weatherVisibility.windFarm)
      }
      pendingBusiness.delete(farm)
      if (current === generation) delete errors['wind-farm']
    } catch (error) {
      farm.dispose?.()
      pendingBusiness.delete(farm)
      if (current === generation) report('wind-farm', error)
      throw error
    }
  }

  const probe = (lon: number, lat: number): EarthProbeResult => {
    const sample = vectorFeature?.getSample(lon, lat) ?? null
    const value = scalarFeature?.getValueAt(lon, lat) ?? null
    const color = value === null ? null : (scalarFeature?.getColorAt(value) ?? null)
    const items = annotationFeatures
      .filter((feature) => annotationVisibility.get(feature.annotation.id))
      .flatMap((feature) => annotationItemsNear(feature.items, lon, lat))
    return {
      lon,
      lat,
      vector: sample
        ? {
            id: vectorConfig?.id ?? '',
            speed: sample.speed,
            direction: sample.direction,
            unit: vectorConfig?.unit ?? ''
          }
        : null,
      overlay:
        value !== null && overlayConfig && color
          ? {
              id: overlayConfig.id,
              value,
              unit: overlayConfig.unit,
              color
            }
          : null,
      annotations: items
    }
  }

  const install = async (ctx: FeatureContext, options?: EarthPluginConfig): Promise<void> => {
    const current = ++generation
    disposed = false
    controller = new AbortController()
    ctxRef = ctx
    const merged = { ...config, ...options }
    activeConfig = merged
    followClock = merged.followClock ?? true
    visible = merged.visible ?? true
    settings = { ...DEFAULT_EARTH_SETTINGS, ...(merged.settings ?? {}) }
    manifest = await loadEarthManifest(merged.data, { signal: controller.signal })
    if (disposed || current !== generation) return
    const modeId = merged.mode ?? manifest.modes[0]?.id ?? 'atmosphere'
    mode = manifest.modes.find((item) => item.id === modeId) ?? manifest.modes[0] ?? null
    if (!mode) throw new Error('@sgyx/cesium-kit-earth: 没有可用模式')
    level = mode.levels?.find((item) => item.id === (merged.level ?? mode?.defaultLevel)) ?? mode

    const defaults = new Set(mode.defaultAnnotations ?? [])
    manifest.annotations.forEach((annotation) => {
      annotationVisibility.set(annotation.id, defaults.has(annotation.id))
    })
    if (merged.annotations) {
      manifest.annotations.forEach((annotation) => {
        annotationVisibility.set(
          annotation.id,
          merged.annotations?.includes(annotation.id) ?? false
        )
      })
    }

    await installScalar(
      merged.overlay === null
        ? null
        : (overlayById(level, merged.overlay ?? level.defaultOverlay) ?? level.overlays[0] ?? null)
    )
    if (disposed || current !== generation) return
    await installVector(
      merged.vector === null
        ? null
        : (vectorById(level, merged.vector ?? level.defaultVector) ?? level.vectors[0] ?? null)
    )
    if (disposed || current !== generation) return
    await ensureDefaultAnnotations()
    if (disposed || current !== generation) return

    probeFeature = createEarthProbeFeature({
      sample: probe,
      onProbe: merged.onProbe,
      onHover: merged.onHover
    })
    probeFeature.install(ctx, { sample: probe, onProbe: merged.onProbe, onHover: merged.onHover })
    applyGrid()

    if (manifest.metadata?.coastline) {
      try {
        const provider = await loadEarthCoastline(manifest.metadata.coastline, { signal: controller.signal })
        if (disposed || current !== generation) return
        coastLayer = ctx.viewer.imageryLayers.addImageryProvider(provider)
      } catch (error) {
        report('coastline', error)
      }
    }

    if (merged.syncClockRange !== false) {
      syncFieldTime(overlayConfig)
      ctx.clock.seek(
        overlayConfig?.metadata?.times[0]
          ? new Date(overlayConfig.metadata.times[0])
          : manifest.range.start
      )
    }
    ctx.log.info(`地球插件已启用：${manifest.name ?? '未命名'} / ${mode.label}`)
  }

  const setMode = async (next: EarthMode): Promise<void> => {
    if (!manifest) return
    const nextMode = manifest.modes.find((item) => item.id === next)
    if (!nextMode) return
    const request = ++selectionRequest
    scalarRequest++
    vectorRequest++
    disposeScalar()
    disposeVector()
    mode = nextMode
    level = mode.levels?.find((item) => item.id === mode?.defaultLevel) ?? mode
    const defaults = new Set(nextMode.defaultAnnotations ?? [])
    annotationVisibility.forEach((_, id) => {
      annotationVisibility.set(id, defaults.has(id))
    })
    annotationFeatures.forEach((feature) => {
      feature.setVisible(annotationVisibility.get(feature.annotation.id) ?? false)
    })
    await ensureDefaultAnnotations()
    if (request !== selectionRequest || disposed) return
    await installScalar(overlayById(level, level.defaultOverlay) ?? level.overlays[0] ?? null)
    if (request !== selectionRequest || disposed) return
    await installVector(vectorById(level, level.defaultVector) ?? level.vectors[0] ?? null)
    if (request === selectionRequest && !disposed) activeConfig.onModeChange?.(nextMode)
  }

  const plugin: EarthPlugin = {
    name: config.name ?? 'earth-plugin',
    get manifest() {
      return manifest
    },
    get mode() {
      return mode
    },
    get level() {
      return level
    },
    get overlay() {
      return overlayConfig
    },
    get vector() {
      return vectorConfig
    },
    get settings() {
      return { ...settings }
    },
    get errors() {
      return { ...errors }
    },
    get annotations() {
      return annotationFeatures
    },
    get weatherPoints() {
      return weatherPoints
    },
    get weatherWarnings() {
      return weatherWarnings
    },
    get windFarm() {
      return windFarm
    },
    install,
    async setMode(next) {
      await setMode(next)
    },
    async setOverlay(id) {
      selectionRequest++
      if (!level) return
      await installScalar(overlayById(level, id))
    },
    async setVector(id) {
      selectionRequest++
      if (!level) return
      await installVector(vectorById(level, id))
    },
    async setLevel(id) {
      const next = mode?.levels?.find((item) => item.id === id)
      if (!next) return
      const request = ++selectionRequest
      vectorRequest++
      disposeVector()
      const previous = overlayConfig?.label
      level = next
      await installScalar(
        next.overlays.find((item) => item.label === previous) ??
          overlayById(next, next.defaultOverlay) ??
          next.overlays[0] ??
          null
      )
      if (request !== selectionRequest || disposed) return
      await installVector(vectorById(next, next.defaultVector) ?? next.vectors[0] ?? null)
    },
    async setAnnotation(id, value) {
      annotationVisibility.set(id, value)
      if (value && !disposed) await once(`annotation:${id}`, () => ensureAnnotation(id, false))
      else {
        annotationFeatures.find((feature) => feature.annotation.id === id)?.setVisible(false)
      }
    },
    async setWeatherPointsVisible(value) {
      weatherVisibility.points = value
      if (value) await once('points', ensureWeatherPoints)
      weatherPoints?.setVisible(weatherVisibility.points)
    },
    async setWeatherWarningsVisible(value) {
      weatherVisibility.warnings = value
      if (value) await once('warnings', ensureWeatherWarnings)
      weatherWarnings?.setVisible(weatherVisibility.warnings)
    },
    async setWindFarmVisible(value) {
      weatherVisibility.windFarm = value
      if (value) await once('windFarm', ensureWindFarm)
      windFarm?.setVisible(weatherVisibility.windFarm)
    },
    setProjection(value) {
      projection = value
      if (!ctxRef || ctxRef.viewer.isDestroyed()) return
      const scene = ctxRef.viewer.scene
      if (value === 'ORTHOGRAPHIC') {
        scene.morphTo3D(0)
        scene.camera.switchToOrthographicFrustum()
        const frustum = scene.camera.frustum as Cesium.OrthographicFrustum
        frustum.width =
          scene.globe.ellipsoid.maximumRadius *
          2.4 *
          Math.max(1, scene.canvas.clientWidth / scene.canvas.clientHeight)
        scene.requestRender()
        return
      }
      if (scene.mode === Cesium.SceneMode.SCENE3D) scene.camera.switchToPerspectiveFrustum()
      if (value === '2D') {
        ctxRef.viewer.scene.morphTo2D(1)
      } else if (value === 'COLUMBUS_VIEW') {
        ctxRef.viewer.scene.morphToColumbusView(1)
      } else {
        ctxRef.viewer.scene.morphTo3D(1)
      }
    },
    setTime(time) {
      ctxRef?.clock.seek(time)
    },
    setTimeRange(start, end) {
      ctxRef?.clock.setRange(start, end)
    },
    setFollowClock(enabled) {
      followClock = enabled
      scalarFeature?.setFollowClock(enabled)
      vectorFeature?.setFollowClock(enabled)
    },
    setSettings(next) {
      settings = { ...settings, ...next }
      scalarFeature?.setSettings(settings)
      vectorFeature?.setSettings(settings)
      applyGrid()
    },
    probe,
    get sampledTime() {
      return scalarFeature?.getCurrentFrame()?.time ?? null
    },
    get frameTimes() {
      return scalarFeature?.times ?? []
    },
    getPointSeries(lon, lat, options) {
      return samplePointSeries(
        lon,
        lat,
        level?.id ?? '',
        overlayConfig,
        vectorConfig,
        settings.interpolation,
        options
      )
    },
    getState() {
      const dataRef =
        activeConfig.dataRef ??
        (typeof activeConfig.data === 'string' && !activeConfig.data.trim().startsWith('{')
          ? activeConfig.data
          : '')
      if (!dataRef || !mode || !level) throw new Error('保存地球状态需要已安装插件和稳定 dataRef')
      return {
        version: 1,
        dataRef,
        mode: mode.id,
        level: level.id,
        overlay: overlayConfig?.id ?? null,
        vector: vectorConfig?.id ?? null,
        annotations: [...annotationVisibility].filter(([, value]) => value).map(([id]) => id),
        weather: { ...weatherVisibility },
        projection,
        settings: { ...settings },
        followClock
      }
    },
    async restoreState(state) {
      validateEarthState(state)
      if (!state || state.version !== 1 || !manifest || state.dataRef !== plugin.getState().dataRef)
        throw new Error('地球数据集未安装或不匹配')
      if (!manifest.modes.some((item) => item.id === state.mode)) throw new Error('未知地球模式')
      const targetMode = manifest.modes.find((item) => item.id === state.mode)!
      if (targetMode.levels && !targetMode.levels.some((item) => item.id === state.level))
        throw new Error('未知高度层')
      const targetLevel = targetMode.levels?.find((item) => item.id === state.level) ?? targetMode
      if (state.overlay && !targetLevel.overlays.some((item) => item.id === state.overlay))
        throw new Error('未知标量变量')
      if (state.vector && !targetLevel.vectors.some((item) => item.id === state.vector))
        throw new Error('未知矢量变量')
      if (state.annotations.some((id) => !manifest!.annotations.some((item) => item.id === id)))
        throw new Error('未知注释')
      await plugin.setMode(state.mode)
      await plugin.setLevel(state.level)
      await plugin.setOverlay(state.overlay)
      await plugin.setVector(state.vector)
      for (const annotation of manifest.annotations)
        await plugin.setAnnotation(annotation.id, state.annotations.includes(annotation.id))
      await plugin.setWeatherPointsVisible(state.weather.points)
      await plugin.setWeatherWarningsVisible(state.weather.warnings)
      await plugin.setWindFarmVisible(state.weather.windFarm)
      plugin.setSettings(state.settings)
      plugin.setFollowClock(state.followClock)
      plugin.setProjection(state.projection)
    },
    getLegend() {
      return scalarFeature?.getLegend() ?? null
    },
    dispose() {
      disposed = true
      controller.abort()
      generation++
      selectionRequest++
      pendingAnnotations.forEach((feature) => feature.dispose?.())
      pendingAnnotations.clear()
      pendingBusiness.forEach((feature) => feature.dispose?.())
      pendingBusiness.clear()
      tasks.clear()
      scalarRequest++
      vectorRequest++
      probeFeature?.dispose?.()
      disposeScalar()
      disposeVector()
      annotationFeatures.forEach((feature) => feature.dispose?.())
      annotationFeatures = []
      weatherPoints?.dispose?.()
      weatherWarnings?.dispose?.()
      windFarm?.dispose?.()
      weatherPoints = null
      weatherWarnings = null
      windFarm = null
      probeFeature = null
      if (gridLayer && ctxRef && !ctxRef.viewer.isDestroyed()) {
        ctxRef.viewer.imageryLayers.remove(gridLayer, true)
      }
      gridLayer = null
      if (coastLayer && ctxRef && !ctxRef.viewer.isDestroyed())
        ctxRef.viewer.imageryLayers.remove(coastLayer, true)
      coastLayer = null
      mode = null
      level = null
      overlayConfig = null
      vectorConfig = null
      manifest = null
      ctxRef = null
    }
  }

  return plugin
}
