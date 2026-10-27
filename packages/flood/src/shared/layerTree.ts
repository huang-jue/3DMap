import type { FeatureContext } from '@sgyx/cesium-kit-core'

export function ensureFloodLayerGroup(ctx: FeatureContext): string | undefined {
  const layerManager = ctx.layerManager
  if (!layerManager) return undefined
  const existing = layerManager
    .tree()
    .find((node) => node.kind === 'group' && node.name === '水旱灾害防御')
  return existing?.id ?? layerManager.createGroup('水旱灾害防御').id
}
