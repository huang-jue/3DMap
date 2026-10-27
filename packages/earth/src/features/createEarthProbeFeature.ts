import type { CesiumFeature, FeatureContext } from '@sgyx/cesium-kit-core'
import type { EarthProbeResult } from '../shared/types'

export interface EarthProbeFeatureOptions {
  sample: (lon: number, lat: number) => EarthProbeResult
  onProbe?: (result: EarthProbeResult | null) => void
  name?: string
}

export interface EarthProbeFeature extends CesiumFeature<EarthProbeFeatureOptions> {
  probeAt(lon: number, lat: number): EarthProbeResult
}

/** 地球模式点查：点击地图采样当前矢量场与标量场。 */
export function createEarthProbeFeature(
  defaultOptions: EarthProbeFeatureOptions
): EarthProbeFeature {
  const install = (ctx: FeatureContext, options?: EarthProbeFeatureOptions): void => {
    const merged = { ...defaultOptions, ...options }
    const offClick = ctx.pick.on('click', ({ lonLatHeight }) => {
      merged.onProbe?.(merged.sample(lonLatHeight.lon, lonLatHeight.lat))
    })
    const offMiss = ctx.pick.onMiss(() => merged.onProbe?.(null))
    ctx.layers.onDispose(() => {
      offClick()
      offMiss()
    })
  }

  return {
    name: defaultOptions.name ?? 'earth-probe',
    install,
    probeAt(lon, lat) {
      return defaultOptions.sample(lon, lat)
    },
    dispose() {}
  }
}
