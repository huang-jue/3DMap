import type { CesiumFeature, FeatureContext } from '@sgyx/cesium-kit-core'
import { openWindSource, loadWindGrids } from '../data/loadWind'
import { findNearestTimeIndex, WindTimeInterpolator } from '../data/timeSeries'
import type { ParseWindOptions, WindGrid, WindSample } from '../shared/types'
import { WindFieldLayer, type WindFieldLayerOptions } from './WindFieldLayer'

export interface WindFieldFeatureOptions extends WindFieldLayerOptions {
  /** 风场数据：WindGrid、WindGrid[]、JSON 字符串或 URL */
  data: WindGrid | WindGrid[] | string
  /** 插件名，默认 wind-field */
  name?: string
  /** 解析原生数据时的选项 */
  parse?: ParseWindOptions
  /** 多时刻数据是否跟随 ClockService，默认 true */
  followClock?: boolean
  /** 安装后是否飞到风场范围，默认 false */
  flyTo?: boolean
}

export interface WindFieldFeature extends CesiumFeature<WindFieldFeatureOptions> {
  readonly layer: WindFieldLayer | null
  readonly grids: WindGrid[]
  setVisible(visible: boolean): void
  updateData(data: WindGrid | WindGrid[] | string): Promise<void>
  updateOptions(options: Partial<WindFieldLayerOptions>): void
  getDataAtLonLat(lon: number, lat: number): WindSample | null
}

function pickLayerOptions(options: WindFieldFeatureOptions): WindFieldLayerOptions {
  return {
    renderer: options.renderer,
    particlesTextureSize: options.particlesTextureSize,
    particleHeight: options.particleHeight,
    lineWidth: options.lineWidth,
    lineLength: options.lineLength,
    speedFactor: options.speedFactor,
    dropRate: options.dropRate,
    dropRateBump: options.dropRateBump,
    colors: options.colors,
    flipY: options.flipY,
    useViewerBounds: options.useViewerBounds,
    domain: options.domain,
    displayRange: options.displayRange,
    dynamic: options.dynamic,
    showSpeedOverlay: options.showSpeedOverlay,
    speedOverlayAlpha: options.speedOverlayAlpha,
    speedOverlayColors: options.speedOverlayColors
  }
}

function gridAt(grids: WindGrid[], time: Date, followClock: boolean): WindGrid | undefined {
  if (grids.length === 0) return undefined
  if (grids.length === 1 || !followClock) return grids[0]
  return grids[findNearestTimeIndex(grids, time)] ?? grids[0]
}

/**
 * 创建气象风场插件。
 *
 * 通过 `ctx.layers.primitive` 登记图层，卸载时由内核统一回收。
 */
export function createWindFieldFeature(defaultOptions: WindFieldFeatureOptions): WindFieldFeature {
  let layer: WindFieldLayer | null = null
  let grids: WindGrid[] = []
  let unsubscribeTick: (() => void) | undefined
  let followClock = defaultOptions.followClock ?? true
  let disposed = false
  let clock: FeatureContext['clock'] | null = null
  let timeInterpolator: WindTimeInterpolator | null = null
  let offState: (() => void) | undefined
  let lastSampleAt = 0
  let source: Awaited<ReturnType<typeof openWindSource>> | null = null
  let controller = new AbortController()
  let frameRequest = 0
  let loadingKey = ''
  let loadedKey = ''
  let viewerRef: FeatureContext['viewer'] | null = null
  const loadAt = async (time: Date): Promise<WindGrid[]> => {
    if (!source) return []
    const times = source.times
    let right = times.findIndex((item) => item.getTime() >= time.getTime())
    if (right < 0) right = times.length - 1
    const left = Math.max(0, right - 1)
    const indexes =
      defaultOptions.renderer === 'trails' && followClock
        ? [...new Set([left, right])]
        : [
            followClock
              ? findNearestTimeIndex(
                  times.map((refTime) => ({ refTime })),
                  time
                )
              : 0
          ]
    return Promise.all(
      indexes.map((index) => source!.getFrame(index, { signal: controller.signal }))
    )
  }

  const install = async (ctx: FeatureContext, options?: WindFieldFeatureOptions): Promise<void> => {
    disposed = false
    controller = new AbortController()
    clock = ctx.clock
    viewerRef = ctx.viewer
    const merged: WindFieldFeatureOptions = { ...defaultOptions, ...options }
    followClock = merged.followClock ?? true
    source = await openWindSource(merged.data, merged.parse, { signal: controller.signal })
    grids = await loadAt(ctx.clock.state.currentTime)
    if (disposed) return
    grids.sort((a, b) => (a.refTime?.getTime() ?? 0) - (b.refTime?.getTime() ?? 0))
    timeInterpolator = merged.renderer === 'trails' ? new WindTimeInterpolator(grids) : null
    const grid = gridAt(grids, ctx.clock.state.currentTime, followClock)
    if (!grid) throw new Error('@cesium-kit/wind: 风场数据为空')

    layer = new WindFieldLayer(ctx.viewer, grid, pickLayerOptions(merged))
    ctx.layers.primitive(layer)
    layer.add()

    if (merged.flyTo) layer.zoomTo(1.5)

    if (followClock && (source?.times.length ?? 0) > 1) {
      const applyTime = (currentTime: Date, force = false) => {
        const now = performance.now()
        if (!force && now - lastSampleAt < 160) return
        lastSampleAt = now
        const times = source!.times
        let right = times.findIndex((item) => item.getTime() >= currentTime.getTime())
        if (right < 0) right = times.length - 1
        const key = `${Math.max(0, right - 1)}:${right}`
        const update = () => {
          const next =
            timeInterpolator?.at(clock!.state.currentTime) ?? gridAt(grids, currentTime, true)
          if (next) {
            layer?.updateData(next)
          }
        }
        if (loadedKey === key) {
          update()
          return
        }
        if (loadingKey === key) return
        loadingKey = key
        const request = ++frameRequest
        void loadAt(currentTime)
          .then((nextGrids) => {
            if (disposed || request !== frameRequest) return
            grids = nextGrids
            loadedKey = key
            loadingKey = ''
            timeInterpolator = merged.renderer === 'trails' ? new WindTimeInterpolator(grids) : null
            update()
            if (right + 1 < times.length)
              void source?.getFrame(right + 1, { signal: controller.signal }).catch(() => undefined)
          })
          .catch((error) => {
            if (!disposed && request === frameRequest) {
              loadingKey = ''
              ctx.log.warn('矢量帧加载失败', error)
            }
          })
      }
      unsubscribeTick = ctx.clock.onTick(({ currentTime }) => applyTime(currentTime))
      offState = ctx.clock.onStateChange(({ currentTime }) => applyTime(currentTime, true))
      ctx.layers.onDispose(() => unsubscribeTick?.())
      ctx.layers.onDispose(() => offState?.())
    }

    ctx.log.info(`风场已加载：${grid.width}x${grid.height}，${grids.length} 个时刻`)
  }

  const feature: WindFieldFeature = {
    name: defaultOptions.name ?? 'wind-field',
    get layer() {
      return layer
    },
    get grids() {
      return grids
    },
    install,
    setVisible(visible: boolean) {
      if (layer) layer.show = visible
    },
    async updateData(data: WindGrid | WindGrid[] | string) {
      const request = ++frameRequest
      const nextGrids = await loadWindGrids(data, defaultOptions.parse, {
        signal: controller.signal
      })
      if (disposed || request !== frameRequest) return
      const nextSource = await openWindSource(data, defaultOptions.parse, {
        signal: controller.signal
      })
      if (disposed || request !== frameRequest) return
      source = nextSource
      loadedKey = loadingKey = ''
      const next = gridAt(nextGrids, clock?.state.currentTime ?? new Date(), followClock)
      if (!next) throw new Error('@cesium-kit/wind: 风场数据为空')
      grids = nextGrids
      grids.sort((a, b) => (a.refTime?.getTime() ?? 0) - (b.refTime?.getTime() ?? 0))
      timeInterpolator =
        defaultOptions.renderer === 'trails' ? new WindTimeInterpolator(grids) : null
      layer?.updateData(next)
    },
    updateOptions(options: Partial<WindFieldLayerOptions>) {
      layer?.updateOptions(options)
    },
    getDataAtLonLat(lon: number, lat: number) {
      return layer?.getDataAtLonLat(lon, lat) ?? null
    },
    dispose() {
      disposed = true
      controller.abort()
      frameRequest++
      source = null
      loadedKey = loadingKey = ''
      grids = []
      unsubscribeTick?.()
      offState?.()
      offState = undefined
      timeInterpolator = null
      unsubscribeTick = undefined
      if (layer && viewerRef && !viewerRef.isDestroyed()) viewerRef.scene.primitives.remove(layer)
      layer?.destroy()
      layer = null
      viewerRef = null
      clock = null
    }
  }

  return feature
}
