import type { CesiumFeature, FeatureContext } from '@sgyx/cesium-kit-core'
import { openEarthScalarSource } from '../data/loadEarthData'
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
  readonly times: Date[]
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
  let source: Awaited<ReturnType<typeof openEarthScalarSource>> | null = null
  let controller = new AbortController()
  let frameRequest = 0
  let requestedIndex = -1
  let offState: (() => void) | undefined
  let ctxRef: FeatureContext | null = null
  let unsubscribeTick: (() => void) | undefined
  let followClock = true
  let nodeId: string | undefined
  let visible = true
  let disposed = false
  let settings: Partial<EarthSettings> = defaultOptions.settings ?? {}

  const applyTime = (time: Date): void => {
    if (!source) return
    const index = findNearestIndex(
      source.times.map((time) => ({ time })),
      time
    )
    if (index < 0 || index === requestedIndex) return
    requestedIndex = index
    const request = ++frameRequest
    const current = source
    void current
      .getFrame(index, { signal: controller.signal })
      .then((frame) => {
        if (disposed || request !== frameRequest) return
        currentIndex = index
        frames = [frame]
        layer?.updateFrame(frame)
        for (const neighbor of [index - 1, index + 1]) {
          if (neighbor >= 0 && neighbor < current.times.length)
            void current.getFrame(neighbor, { signal: controller.signal }).catch(() => undefined)
        }
      })
      .catch((error) => {
        if (!disposed && request === frameRequest) {
          requestedIndex = -1
          ctxRef?.log.warn('标量帧加载失败，可重试', error)
        }
      })
  }

  const subscribe = (): void => {
    if (!ctxRef || !followClock || (source?.times.length ?? 0) <= 1 || unsubscribeTick) return
    unsubscribeTick = ctxRef.clock.onTick(({ currentTime }) => applyTime(currentTime))
    offState = ctxRef.clock.onStateChange(({ currentTime }) => applyTime(currentTime))
  }

  const unsubscribe = (): void => {
    unsubscribeTick?.()
    unsubscribeTick = undefined
    offState?.()
    offState = undefined
  }

  const install = async (
    ctx: FeatureContext,
    options?: EarthScalarFeatureOptions
  ): Promise<void> => {
    disposed = false
    controller = new AbortController()
    ctxRef = ctx
    const merged = { ...defaultOptions, ...options }
    visible = merged.visible ?? true
    followClock = merged.followClock ?? true
    source = await openEarthScalarSource(merged.data ?? merged.overlay.data, {
      signal: controller.signal
    })
    if (disposed) return
    if (!source.times.length) throw new Error('标量数据为空')
    currentIndex = findNearestIndex(
      source.times.map((time) => ({ time })),
      ctx.clock.state.currentTime
    )
    requestedIndex = currentIndex
    const frame = await source.getFrame(currentIndex, { signal: controller.signal })
    if (disposed) return
    frames = [frame]
    data = { frames, legend: source.legend }
    layer = new EarthScalarLayer(ctx.viewer, data, {
      visible,
      alpha: merged.alpha ?? settings.overlayAlpha ?? 0.88,
      colors: merged.overlay.colors,
      min: merged.overlay.min,
      max: merged.overlay.max,
      scale: merged.overlay.scale,
      interpolation: merged.overlay.categories ? 'nearest' : (settings.interpolation ?? 'bilinear'),
      canvasScale: settings.hd ? 12 : 8,
      onError: (error) => ctx.log.warn('标量图层渲染失败', error)
    })
    ctx.layers.onDispose(() => layer?.destroy())
    layer.add()
    layer.updateFrame(frame)
    subscribe()
    for (const index of [currentIndex - 1, currentIndex + 1])
      if (index >= 0 && index < source.times.length)
        void source.getFrame(index, { signal: controller.signal }).catch(() => undefined)

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
    get times() {
      return source?.times ?? []
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
      const rerender =
        (next.interpolation !== undefined && next.interpolation !== settings.interpolation) ||
        (next.hd !== undefined && next.hd !== settings.hd)
      settings = { ...settings, ...next }
      if (rerender)
        layer?.setSettings({
          interpolation: defaultOptions.overlay.categories ? 'nearest' : settings.interpolation,
          hd: settings.hd
        })
      if (settings.overlayAlpha !== undefined && layer) layer.alpha = settings.overlayAlpha
    },
    getValueAt(lon, lat) {
      return layer?.displayedFrame ? layer.getValueAt(lon, lat) : null
    },
    getColorAt(value) {
      return layer?.colorAt(value) ?? null
    },
    getLegend() {
      return layer?.legend ?? null
    },
    getCurrentFrame() {
      return layer?.displayedFrame ?? null
    },
    dispose() {
      disposed = true
      frameRequest++
      controller.abort()
      source = null
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
