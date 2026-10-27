import type { CesiumFeature, FeatureContext } from '@sgyx/cesium-kit-core'
import {
  createWindFieldFeature,
  type WindFieldFeature,
  type WindSample
} from '@sgyx/cesium-kit-wind'
import { ensureEarthLayerGroup } from '../shared/layerTree'
import type { EarthSettings, EarthVectorConfig } from '../shared/types'

export interface EarthVectorFeatureOptions {
  vector: EarthVectorConfig
  followClock?: boolean
  visible?: boolean
  settings?: Partial<EarthSettings>
  name?: string
}

export interface EarthVectorFeature extends CesiumFeature<EarthVectorFeatureOptions> {
  readonly vector: EarthVectorConfig
  readonly feature: WindFieldFeature | null
  setVisible(visible: boolean): void
  setFollowClock(enabled: boolean): void
  setSettings(settings: Partial<EarthSettings>): void
  getSample(lon: number, lat: number): WindSample | null
}

/** 矢量场 Feature：风、洋流、波浪，复用 wind 包的 GPU 粒子。 */
export function createEarthVectorFeature(
  defaultOptions: EarthVectorFeatureOptions
): EarthVectorFeature {
  let feature: WindFieldFeature | null = null
  let ctxRef: FeatureContext | null = null
  let followClock = true
  let visible = true
  let settings: Partial<EarthSettings> = defaultOptions.settings ?? {}
  let nodeId: string | undefined
  let disposed = false

  const particleOptions = () => ({
    renderer: 'trails' as const,
    particlesTextureSize: settings.flowDensity ?? (settings.hd ? 192 : 128),
    particleHeight: 100,
    lineWidth: { min: settings.hd ? 1.1 : 0.85, max: 1.5 },
    speedFactor: settings.flowSpeed ?? defaultOptions.vector.speedFactor ?? 1.5,
    colors: defaultOptions.vector.colors ?? ['#ffffff'],
    dynamic: settings.dynamic ?? true,
    followClock,
    flyTo: false
  })

  const disposeChild = (): void => {
    feature?.dispose?.()
    feature = null
  }

  const createChild = async (ctx: FeatureContext): Promise<void> => {
    disposeChild()
    const next = createWindFieldFeature({
      data: defaultOptions.vector.data,
      name: defaultOptions.name ?? `earth-vector-${defaultOptions.vector.id}`,
      ...particleOptions()
    })
    await next.install(ctx, {
      data: defaultOptions.vector.data,
      name: defaultOptions.name ?? `earth-vector-${defaultOptions.vector.id}`,
      ...particleOptions()
    })
    if (disposed) {
      next.dispose?.()
      return
    }
    feature = next
    feature.setVisible(visible)
  }

  const install = async (
    ctx: FeatureContext,
    options?: EarthVectorFeatureOptions
  ): Promise<void> => {
    disposed = false
    ctxRef = ctx
    const merged = { ...defaultOptions, ...options }
    followClock = merged.followClock ?? true
    visible = merged.visible ?? true
    settings = merged.settings ?? settings
    await createChild(ctx)
    if (disposed) return
    if (ctx.layerManager) {
      try {
        nodeId = ctx.layerManager.addCustom(merged.vector.label, {
          id: `earth-vector:${merged.vector.id}`,
          parentId: ensureEarthLayerGroup(ctx),
          visible,
          handle: {
            setVisible: (value) => {
              visible = value
              feature?.setVisible(value)
            },
            destroy: () => {
              feature?.setVisible(false)
            }
          }
        }).id
      } catch {
        // 忽略重复节点
      }
    }
    ctx.log.info(`地球矢量场已加载：${merged.vector.label}`)
  }

  const vectorFeature: EarthVectorFeature = {
    name: defaultOptions.name ?? `earth-vector-${defaultOptions.vector.id}`,
    get vector() {
      return defaultOptions.vector
    },
    get feature() {
      return feature
    },
    install,
    setVisible(value) {
      visible = value
      feature?.setVisible(value)
      if (nodeId) ctxRef?.layerManager?.setVisible(nodeId, value)
    },
    setFollowClock(enabled) {
      if (followClock === enabled) return
      followClock = enabled
      if (ctxRef) void createChild(ctxRef)
    },
    setSettings(next) {
      settings = { ...settings, ...next }
      feature?.updateOptions({
        particlesTextureSize: settings.flowDensity ?? (settings.hd ? 192 : 128),
        speedFactor: settings.flowSpeed ?? defaultOptions.vector.speedFactor ?? 1.5,
        lineWidth: { min: settings.hd ? 1.1 : 0.85, max: 1.5 },
        dynamic: settings.dynamic ?? true
      })
    },
    getSample(lon, lat) {
      return feature?.getDataAtLonLat(lon, lat) ?? null
    },
    dispose() {
      disposed = true
      if (nodeId && ctxRef?.layerManager?.get(nodeId)) {
        ctxRef.layerManager.remove(nodeId, { removeSource: false })
      }
      nodeId = undefined
      disposeChild()
      ctxRef = null
    }
  }

  return vectorFeature
}
