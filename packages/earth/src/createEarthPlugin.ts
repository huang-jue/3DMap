import * as Cesium from 'cesium'
import type { CesiumFeature, FeatureContext } from '@sgyx/cesium-kit-core'
import {
  createWeatherPointFeature,
  createWeatherWarningFeature,
  type WeatherPointFeature,
  type WeatherWarningFeature
} from '@sgyx/cesium-kit-weather'
import { createWindFarmFeature, type WindFarmFeature } from '@sgyx/cesium-kit-wind'
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
  type EarthAnnotationItem,
  type EarthLegend,
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
  mode?: EarthMode
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
  readonly manifest: EarthManifest | null
  readonly mode: EarthModeConfig | null
  readonly overlay: EarthOverlayConfig | null
  readonly vector: EarthVectorConfig | null
  readonly settings: EarthSettings
  readonly errors: Partial<Record<string, unknown>>
  readonly annotations: EarthAnnotationFeature[]
  readonly weatherPoints: WeatherPointFeature | null
  readonly weatherWarnings: WeatherWarningFeature | null
  readonly windFarm: WindFarmFeature | null
  setMode(mode: EarthMode): Promise<void>
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
}

function overlayById(
  mode: EarthModeConfig,
  id: string | null | undefined
): EarthOverlayConfig | null {
  if (!id) return null
  return mode.overlays.find((item) => item.id === id) ?? null
}

function vectorById(
  mode: EarthModeConfig,
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
  const errors: Partial<Record<string, unknown>> = {}
  const annotationVisibility = new Map<string, boolean>()

  const report = (key: string, error: unknown): void => {
    errors[key] = error
    activeConfig.onError?.(key, error)
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
    scalarFeature?.dispose?.()
    scalarFeature = null
  }

  const disposeVector = (): void => {
    vectorFeature?.dispose?.()
    vectorFeature = null
  }

  const installScalar = async (overlay: EarthOverlayConfig | null): Promise<void> => {
    const request = ++scalarRequest
    if (!ctxRef) return
    disposeScalar()
    overlayConfig = overlay
    if (!overlay) return
    const feature = createEarthScalarFeature({
      overlay,
      followClock,
      visible,
      settings,
      name: `earth-scalar-${overlay.id}`
    })
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
      scalarFeature = feature
      // A newly installed scalar must stay below the transparent coastline/grid.
      if (coastLayer) ctxRef.viewer.imageryLayers.raiseToTop(coastLayer)
      if (gridLayer) ctxRef.viewer.imageryLayers.raiseToTop(gridLayer)
      delete errors.scalar
    } catch (error) {
      feature.dispose?.()
      report('scalar', error)
    }
  }

  const installVector = async (vector: EarthVectorConfig | null): Promise<void> => {
    const request = ++vectorRequest
    if (!ctxRef) return
    disposeVector()
    vectorConfig = vector
    if (!vector) return
    const feature = createEarthVectorFeature({
      vector,
      followClock,
      visible,
      settings,
      name: `earth-vector-${vector.id}`
    })
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
      vectorFeature = feature
      delete errors.vector
    } catch (error) {
      feature.dispose?.()
      report('vector', error)
    }
  }

  const ensureAnnotation = async (
    id: string,
    visible = annotationVisibility.get(id) ?? false
  ): Promise<void> => {
    if (!manifest || !ctxRef) return
    const existing = annotationFeatures.find((feature) => feature.annotation.id === id)
    if (existing) {
      existing.setVisible(visible)
      return
    }
    const annotation = manifest.annotations.find((item) => item.id === id)
    if (!annotation) return
    const feature = createEarthAnnotationFeature({
      annotation,
      visible,
      name: `earth-annotation-${annotation.id}`
    })
    try {
      await feature.install(ctxRef, { annotation, visible })
      if (disposed) {
        feature.dispose?.()
        return
      }
      annotationFeatures.push(feature)
      delete errors[`annotation:${annotation.id}`]
    } catch (error) {
      feature.dispose?.()
      report(`annotation:${annotation.id}`, error)
    }
  }

  const ensureDefaultAnnotations = async (): Promise<void> => {
    for (const id of mode?.defaultAnnotations ?? []) {
      await ensureAnnotation(id, true)
    }
  }

  const ensureWeatherPoints = async (): Promise<void> => {
    if (weatherPoints) return
    if (!manifest?.weather?.points || !ctxRef) throw new Error('当前数据集未配置城市预报数据')
    const points = createWeatherPointFeature({
      points: manifest.weather.points,
      time: manifest.weather.sampleTime,
      name: 'earth-weather-points',
      visible: true,
      showPopup: true
    })
    try {
      await points.install(ctxRef, {
        points: manifest.weather.points,
        time: manifest.weather.sampleTime,
        name: 'earth-weather-points',
        visible: true,
        showPopup: true
      })
      if (disposed) points.dispose?.()
      else weatherPoints = points
      delete errors['weather-points']
    } catch (error) {
      points.dispose?.()
      report('weather-points', error)
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
      visible: true,
      showPopup: true
    })
    try {
      await warnings.install(ctxRef, {
        warnings: manifest.weather.warnings,
        time: manifest.weather.sampleTime,
        name: 'earth-weather-warnings',
        visible: true,
        showPopup: true
      })
      if (disposed) warnings.dispose?.()
      else weatherWarnings = warnings
      delete errors['weather-warnings']
    } catch (error) {
      warnings.dispose?.()
      report('weather-warnings', error)
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
    try {
      await farm.install(ctxRef, {
        turbines: manifest.weather.windFarm,
        name: 'earth-wind-farm'
      })
      if (disposed) farm.dispose?.()
      else windFarm = farm
      delete errors['wind-farm']
    } catch (error) {
      farm.dispose?.()
      report('wind-farm', error)
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
    disposed = false
    ctxRef = ctx
    const merged = { ...config, ...options }
    activeConfig = merged
    followClock = merged.followClock ?? true
    visible = merged.visible ?? true
    settings = { ...DEFAULT_EARTH_SETTINGS, ...(merged.settings ?? {}) }
    manifest = await loadEarthManifest(merged.data)
    if (disposed) return
    const modeId = merged.mode ?? manifest.modes[0]?.id ?? 'atmosphere'
    mode = manifest.modes.find((item) => item.id === modeId) ?? manifest.modes[0] ?? null
    if (!mode) throw new Error('@sgyx/cesium-kit-earth: 没有可用模式')

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
      overlayById(mode, merged.overlay ?? mode.defaultOverlay) ?? mode.overlays[0] ?? null
    )
    await installVector(
      vectorById(mode, merged.vector ?? mode.defaultVector) ?? mode.vectors[0] ?? null
    )
    await ensureDefaultAnnotations()

    probeFeature = createEarthProbeFeature({
      sample: probe,
      onProbe: merged.onProbe,
      onHover: merged.onHover
    })
    probeFeature.install(ctx, { sample: probe, onProbe: merged.onProbe, onHover: merged.onHover })
    applyGrid()

    if (manifest.metadata?.coastline) {
      try {
        const provider = await loadEarthCoastline(manifest.metadata.coastline)
        if (disposed) return
        coastLayer = ctx.viewer.imageryLayers.addImageryProvider(provider)
      } catch (error) {
        report('coastline', error)
      }
    }

    if (merged.syncClockRange !== false) {
      ctx.clock.setRange(manifest.range.start, manifest.range.end)
      ctx.clock.seek(manifest.range.start)
    }
    ctx.log.info(`地球插件已启用：${manifest.name ?? '未命名'} / ${mode.label}`)
  }

  const setMode = async (next: EarthMode): Promise<void> => {
    if (!manifest) return
    const nextMode = manifest.modes.find((item) => item.id === next)
    if (!nextMode) return
    mode = nextMode
    const defaults = new Set(nextMode.defaultAnnotations ?? [])
    annotationVisibility.forEach((_, id) => {
      annotationVisibility.set(id, defaults.has(id))
    })
    annotationFeatures.forEach((feature) => {
      feature.setVisible(annotationVisibility.get(feature.annotation.id) ?? false)
    })
    await ensureDefaultAnnotations()
    if (mode !== nextMode || disposed) return
    await installScalar(
      overlayById(nextMode, nextMode.defaultOverlay) ?? nextMode.overlays[0] ?? null
    )
    if (mode !== nextMode || disposed) return
    await installVector(vectorById(nextMode, nextMode.defaultVector) ?? nextMode.vectors[0] ?? null)
    activeConfig.onModeChange?.(nextMode)
  }

  const plugin: EarthPlugin = {
    name: config.name ?? 'earth-plugin',
    get manifest() {
      return manifest
    },
    get mode() {
      return mode
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
      if (!mode) return
      await installScalar(overlayById(mode, id))
    },
    async setVector(id) {
      if (!mode) return
      await installVector(vectorById(mode, id))
    },
    async setAnnotation(id, value) {
      annotationVisibility.set(id, value)
      if (value) await ensureAnnotation(id, true)
      else {
        annotationFeatures.find((feature) => feature.annotation.id === id)?.setVisible(false)
      }
    },
    async setWeatherPointsVisible(value) {
      if (value) await ensureWeatherPoints()
      weatherPoints?.setVisible(value)
    },
    async setWeatherWarningsVisible(value) {
      if (value) await ensureWeatherWarnings()
      weatherWarnings?.setVisible(value)
    },
    async setWindFarmVisible(value) {
      if (value) await ensureWindFarm()
      windFarm?.setVisible(value)
    },
    setProjection(value) {
      if (!ctxRef || ctxRef.viewer.isDestroyed()) return
      const scene = ctxRef.viewer.scene
      if (value === 'ORTHOGRAPHIC') {
        scene.morphTo3D(0)
        scene.camera.switchToOrthographicFrustum()
        const frustum = scene.camera.frustum as Cesium.OrthographicFrustum
        frustum.width = scene.globe.ellipsoid.maximumRadius * 2.4 *
          Math.max(1, scene.canvas.clientWidth / scene.canvas.clientHeight)
        scene.requestRender()
        return
      }
      if (scene.mode === Cesium.SceneMode.SCENE3D)
        scene.camera.switchToPerspectiveFrustum()
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
    getLegend() {
      return scalarFeature?.getLegend() ?? null
    },
    dispose() {
      disposed = true
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
      overlayConfig = null
      vectorConfig = null
      manifest = null
      ctxRef = null
    }
  }

  return plugin
}
