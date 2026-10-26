import type { CesiumFeature, FeatureContext } from '@cesium-kit/core'
import type { WindSample, WindTurbine } from '../shared/types'
import { WindFarmLayer, type WindFarmLayerOptions } from './WindFarmLayer'

export interface WindFarmFeatureOptions extends WindFarmLayerOptions {
  /** 风机数组、JSON 字符串或 URL */
  turbines: WindTurbine[] | string
  /** 插件名，默认 wind-farm */
  name?: string
}

export interface WindFarmFeature extends CesiumFeature<WindFarmFeatureOptions> {
  readonly layer: WindFarmLayer | null
  readonly turbines: WindTurbine[]
  select(id: string | null): void
  setVisible(visible: boolean): void
  setWindSampler(sampler?: (lon: number, lat: number) => WindSample | null): void
}

function isJsonText(value: string): boolean {
  const text = value.trim()
  return text.startsWith('[') || text.startsWith('{')
}

function parseTurbinesPayload(payload: unknown): WindTurbine[] {
  if (Array.isArray(payload)) return payload as WindTurbine[]
  if (payload && typeof payload === 'object' && Array.isArray((payload as { turbines?: unknown }).turbines)) {
    return (payload as { turbines: WindTurbine[] }).turbines
  }
  throw new Error('@cesium-kit/wind: 风机数据必须是数组或 { turbines: [] }')
}

/** 加载风机数据。 */
export async function loadTurbines(input: WindTurbine[] | string): Promise<WindTurbine[]> {
  if (Array.isArray(input)) return input
  if (isJsonText(input)) return parseTurbinesPayload(JSON.parse(input))

  if (typeof fetch !== 'function') {
    throw new Error('@cesium-kit/wind: 当前环境没有 fetch，请直接传入风机数组')
  }

  const response = await fetch(input)
  if (!response.ok) {
    throw new Error(`@cesium-kit/wind: 风机数据请求失败 ${response.status} ${response.statusText}`)
  }
  return parseTurbinesPayload(await response.json())
}

function pickLayerOptions(options: WindFarmFeatureOptions): WindFarmLayerOptions {
  return {
    statusColors: options.statusColors,
    pointSize: options.pointSize,
    label: options.label,
    selectedColor: options.selectedColor,
    selectedScale: options.selectedScale,
    statusText: options.statusText,
    onSelect: options.onSelect,
    windSampler: options.windSampler
  }
}

/**
 * 创建风电场插件。一期使用 Billboard + Label，支持状态色、时间序列与选中高亮。
 */
export function createWindFarmFeature(defaultOptions: WindFarmFeatureOptions): WindFarmFeature {
  let layer: WindFarmLayer | null = null
  let turbines: WindTurbine[] = []
  let disposed = false

  const install = async (ctx: FeatureContext, options?: WindFarmFeatureOptions): Promise<void> => {
    disposed = false
    const merged: WindFarmFeatureOptions = { ...defaultOptions, ...options }
    turbines = await loadTurbines(merged.turbines)
    if (disposed) return
    layer = new WindFarmLayer(ctx.viewer, turbines, {
      ...pickLayerOptions(merged),
      addEntity: (entity) => ctx.layers.add(entity)
    })

    const offPick = ctx.pick.on('click', ({ entity }) => {
      layer?.handlePick(entity)
    })
    ctx.layers.onDispose(offPick)
    ctx.log.info(`风电场已加载：${turbines.length} 台风机`)
  }

  const feature: WindFarmFeature = {
    name: defaultOptions.name ?? 'wind-farm',
    get layer() {
      return layer
    },
    get turbines() {
      return turbines
    },
    install,
    select(id: string | null) {
      layer?.select(id)
    },
    setVisible(visible: boolean) {
      layer?.setVisible(visible)
    },
    setWindSampler(sampler?: (lon: number, lat: number) => WindSample | null) {
      layer?.setWindSampler(sampler)
    },
    dispose() {
      disposed = true
      layer?.destroy()
      layer = null
      turbines = []
    }
  }

  return feature
}
