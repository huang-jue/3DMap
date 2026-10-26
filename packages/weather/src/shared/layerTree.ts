import type { FeatureContext } from '@sgyx/cesium-kit-core'

/** 确保共享图层树中存在“天气图层”分组。 */
export function ensureWeatherLayerGroup(ctx: FeatureContext): string | undefined {
  const layerManager = ctx.layerManager
  if (!layerManager) return undefined
  const existing = layerManager
    .tree()
    .find((node) => node.kind === 'group' && node.name === '天气图层')
  return existing?.id ?? layerManager.createGroup('天气图层').id
}
