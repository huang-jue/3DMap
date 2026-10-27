import type { CesiumFeature, FeatureContext } from '@sgyx/cesium-kit-core'
import { loadEarthScalarData } from '../data/loadEarthData'
import { findNearestIndex } from '../data/time'
import { EarthScalarLayer } from '../layers/EarthScalarLayer'
import { ensureEarthLayerGroup } from '../shared/layerTree'
import type {
  EarthLegend,
  EarthOverlayConfig,
  EarthScalarData,
  EarthScalarFrame,
  EarthSettings
} from '../shared/types'

export interface EarthScalarFeatureOptions {
  overlay: EarthOverlayConfig
  data?: EarthScalarData | string
  followClock?: boolean
  visible?: boolean
  alpha?: number
  settings?: Partial<EarthSettings>
  name?: string
}

export interface EarthScalarFeature extends CesiumFeature<EarthScalarFeatureOptions> {
  readonly overlay: EarthOverlayConfig
  readonly layer: EarthScalarLayer | null
  readonly frames: EarthScalarFrame[]
  setVisible(visible: boolean): void
  setAlpha(alpha: number): void
  setTime(time: Date): void
  setFollowClock(enabled: boolean): void
  setSettings(settings: Partial<EarthSettings>): void
  getValueAt(lon: number, lat: number): number | null
  getColorAt(value: number): string | null
  getLegend(): EarthLegend | null
  getCurrentFrame(): EarthScalarFrame | null
}

/** 地球标量叠加层 Feature。 */
export function createEarthScalarFeature(
  defaultOptions: EarthScalarFeatureOptions
): EarthScalarFeature {
  let layer: EarthScalarLayer | null = null
  let data: EarthScalarData | null = null
  let frames: EarthScalarFrame[] = []
  let currentIndex = -1
  let ctxRef: FeatureContext | null = null
  let unsubscribeTick: (() => void) | undefined
  let followClock = true
  let nodeId: string | undefined
  let visible = true
  let disposed = false
  let settings: Partial<EarthSettings> = defaultOptions.settings ?? {}

  const applyTime = (time: Date): void => {
    if (frames.length === 0) return
    const index = findNearestIndex(frames, time)
    if (index < 0 || index === currentIndex) return
    currentIndex = index
    const frame = frames[index]
    if (frame) layer?.updateFrame(frame)
  }

  const subscribe = (): void => {
    if (!ctxRef || !followClock || frames.length <= 1 || unsubscribeTick) return
    unsubscribeTick = ctxRef.clock.onTick(({ currentTime }) => applyTime(currentTime))
  }

  const unsubscribe = (): void => {
    unsubscribeTick?.()
    unsubscribeTick = undefined
  }

  const install = async (
    ctx: FeatureContext,
    options?: EarthScalarFeatureOptions
  ): Promise<void> => {
    disposed = false
    ctxRef = ctx
    const merged = { ...defaultOptions, ...options }
    visible = merged.visible ?? true
    followClock = merged.followClock ?? true
    data = await loadEarthScalarData(merged.data ?? merged.overlay.data)
    if (disposed) return
    frames = data.frames
    if (frames.length === 0) throw new Error('@sgyx/cesium-kit-earth: 标量数据为空')
    currentIndex = findNearestIndex(frames, ctx.clock.state.currentTime)
    const frame = frames[currentIndex] ?? frames[0]!
    layer = new EarthScalarLayer(ctx.viewer, data, {
      visible,
      alpha: merged.alpha ?? 0.82,
      colors: merged.overlay.colors,
      min: merged.overlay.min,
      max: merged.overlay.max,
      scale: merged.overlay.scale,
      interpolation: settings.interpolation ?? 'bilinear',
      canvasScale: settings.hd ? 12 : 8,
      onError: (error) => ctx.log.warn('标量图层渲染失败', error)
    })
    ctx.layers.onDispose(() => layer?.destroy())
    layer.add()
    layer.updateFrame(frame)
    subscribe()

    if (ctx.layerManager) {
      try {
        nodeId = ctx.layerManager.addCustom(merged.overlay.label, {
          id: `earth-scalar:${merged.overlay.id}`,
          parentId: ensureEarthLayerGroup(ctx),
          visible,
          handle: {
            setVisible: (value) => {
              visible = value
              if (layer) layer.show = value
            },
            setAlpha: (value) => {
              if (layer) layer.alpha = value
            },
            destroy: () => {
              layer?.destroy()
              layer = null
            }
          }
        }).id
      } catch {
        // 忽略重复节点
      }
    }
    ctx.log.info(`地球标量层已加载：${merged.overlay.label}，${frames.length} 帧`)
  }

  const feature: EarthScalarFeature = {
    name: defaultOptions.name ?? `earth-scalar-${defaultOptions.overlay.id}`,
    get overlay() {
      return defaultOptions.overlay
    },
    get layer() {
      return layer
    },
    get frames() {
      return frames
    },
    install,
    setVisible(value) {
      visible = value
      if (layer) layer.show = value
      if (nodeId) ctxRef?.layerManager?.setVisible(nodeId, value)
    },
    setAlpha(value) {
      if (layer) layer.alpha = value
      if (nodeId) ctxRef?.layerManager?.setAlpha(nodeId, value)
    },
    setTime(time) {
      if (ctxRef) ctxRef.clock.seek(time)
      applyTime(time)
    },
    setFollowClock(enabled) {
      followClock = enabled
      if (enabled) subscribe()
      else unsubscribe()
    },
    setSettings(next) {
      settings = { ...settings, ...next }
      layer?.setSettings({ interpolation: settings.interpolation, hd: settings.hd })
    },
    getValueAt(lon, lat) {
      return layer?.getValueAt(lon, lat) ?? null
    },
    getColorAt(value) {
      return layer?.colorAt(value) ?? null
    },
    getLegend() {
      return layer?.legend ?? null
    },
    getCurrentFrame() {
      return currentIndex >= 0 ? (frames[currentIndex] ?? null) : null
    },
    dispose() {
      disposed = true
      unsubscribe()
      if (nodeId && ctxRef?.layerManager?.get(nodeId)) {
        ctxRef.layerManager.remove(nodeId, { removeSource: false })
      }
      nodeId = undefined
      layer?.destroy()
      layer = null
      frames = []
      data = null
      currentIndex = -1
      ctxRef = null
    }
  }

  return feature
}
