import type { CesiumFeature, FeatureContext } from '@sgyx/cesium-kit-core'
import { loadWindGrids } from '../data/loadWind'
import { findNearestTimeIndex } from '../data/timeSeries'
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
  let currentGrid: WindGrid | undefined
  let unsubscribeTick: (() => void) | undefined
  let followClock = defaultOptions.followClock ?? true
  let disposed = false
  let clock: FeatureContext['clock'] | null = null

  const install = async (ctx: FeatureContext, options?: WindFieldFeatureOptions): Promise<void> => {
    disposed = false
    clock = ctx.clock
    const merged: WindFieldFeatureOptions = { ...defaultOptions, ...options }
    followClock = merged.followClock ?? true
    grids = await loadWindGrids(merged.data, merged.parse)
    if (disposed) return
    const grid = gridAt(grids, ctx.clock.state.currentTime, followClock)
    if (!grid) throw new Error('@cesium-kit/wind: 风场数据为空')

    currentGrid = grid
    layer = new WindFieldLayer(ctx.viewer, grid, pickLayerOptions(merged))
    ctx.layers.primitive(layer)
    layer.add()

    if (merged.flyTo) layer.zoomTo(1.5)

    if (followClock && grids.length > 1) {
      unsubscribeTick = ctx.clock.onTick(({ currentTime }) => {
        const next = gridAt(grids, currentTime, followClock)
        if (!next || next === currentGrid) return
        currentGrid = next
        layer?.updateData(next)
      })
      ctx.layers.onDispose(() => unsubscribeTick?.())
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
      const nextGrids = await loadWindGrids(data, defaultOptions.parse)
      const next = gridAt(nextGrids, clock?.state.currentTime ?? new Date(), followClock)
      if (!next) throw new Error('@cesium-kit/wind: 风场数据为空')
      grids = nextGrids
      currentGrid = next
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
      unsubscribeTick?.()
      unsubscribeTick = undefined
      layer?.destroy()
      layer = null
      currentGrid = undefined
      clock = null
    }
  }

  return feature
}
