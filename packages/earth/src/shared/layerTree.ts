import type { FeatureContext } from '@sgyx/cesium-kit-core'

export function ensureEarthLayerGroup(ctx: FeatureContext): string | undefined {
  const layerManager = ctx.layerManager
  if (!layerManager) return undefined
  const existing = layerManager
    .tree()
    .find((node) => node.kind === 'group' && node.name === '地球可视化')
  return existing?.id ?? layerManager.createGroup('地球可视化').id
}
