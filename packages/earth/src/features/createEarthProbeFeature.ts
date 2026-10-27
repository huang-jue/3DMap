import type { CesiumFeature, FeatureContext } from '@sgyx/cesium-kit-core'
import type { EarthProbeResult } from '../shared/types'

export interface EarthProbeFeatureOptions {
  sample: (lon: number, lat: number) => EarthProbeResult
  onProbe?: (result: EarthProbeResult | null) => void
  onHover?: (result: EarthProbeResult | null) => void
  name?: string
}

export interface EarthProbeFeature extends CesiumFeature<EarthProbeFeatureOptions> {
  probeAt(lon: number, lat: number): EarthProbeResult
}

/** 地球模式点查：点击地图采样当前矢量场与标量场。 */
export function createEarthProbeFeature(
  defaultOptions: EarthProbeFeatureOptions
): EarthProbeFeature {
  let cleanup: (() => void) | undefined
  const install = (ctx: FeatureContext, options?: EarthProbeFeatureOptions): void => {
    cleanup?.()
    const merged = { ...defaultOptions, ...options }
    const offClick = ctx.pick.on('click', ({ lonLatHeight }) => {
      merged.onProbe?.(merged.sample(lonLatHeight.lon, lonLatHeight.lat))
    })
    const offHover = ctx.pick.on('hover', ({ lonLatHeight }) => {
      merged.onHover?.(merged.sample(lonLatHeight.lon, lonLatHeight.lat))
    })
    const offMiss = ctx.pick.onMiss((type) => {
      if (type === 'click') merged.onProbe?.(null)
      else merged.onHover?.(null)
    })
    cleanup = () => {
      offClick()
      offHover()
      offMiss()
    }
    ctx.layers.onDispose(() => cleanup?.())
  }

  return {
    name: defaultOptions.name ?? 'earth-probe',
    install,
    probeAt(lon, lat) {
      return defaultOptions.sample(lon, lat)
    },
    dispose() {
      cleanup?.()
      cleanup = undefined
    }
  }
}
