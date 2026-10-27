import type { CesiumFeature, FeatureContext } from '@sgyx/cesium-kit-core'
import { loadEarthAnnotations } from '../data/loadEarthData'
import { EarthAnnotationLayer } from '../layers/EarthAnnotationLayer'
import { ensureEarthLayerGroup } from '../shared/layerTree'
import { ANNOTATION_COLORS } from '../shared/palettes'
import type { EarthAnnotationConfig, EarthAnnotationItem } from '../shared/types'

export interface EarthAnnotationFeatureOptions {
  annotation: EarthAnnotationConfig
  visible?: boolean
  name?: string
}

export interface EarthAnnotationFeature extends CesiumFeature<EarthAnnotationFeatureOptions> {
  readonly annotation: EarthAnnotationConfig
  readonly items: EarthAnnotationItem[]
  setVisible(visible: boolean): void
}

/** 地球注释 Feature：火点、极光、珊瑚白化等。 */
export function createEarthAnnotationFeature(
  defaultOptions: EarthAnnotationFeatureOptions
): EarthAnnotationFeature {
  let layer: EarthAnnotationLayer | null = null
  let items: EarthAnnotationItem[] = []
  let ctxRef: FeatureContext | null = null
  let nodeId: string | undefined
  let visible = true
  let disposed = false

  const install = async (
    ctx: FeatureContext,
    options?: EarthAnnotationFeatureOptions
  ): Promise<void> => {
    disposed = false
    ctxRef = ctx
    const merged = { ...defaultOptions, ...options }
    visible = merged.visible ?? true
    items = await loadEarthAnnotations(merged.annotation.data)
    if (disposed) return
    layer = new EarthAnnotationLayer(ctx.viewer, items, {
      visible,
      color: ANNOTATION_COLORS[merged.annotation.id] ?? '#f97316',
      addEntity: (entity) => ctx.layers.add(entity)
    })
    layer.setVisible(visible)
    if (ctx.layerManager) {
      try {
        nodeId = ctx.layerManager.addCustom(merged.annotation.label, {
          id: `earth-annotation:${merged.annotation.id}`,
          parentId: ensureEarthLayerGroup(ctx),
          visible,
          handle: {
            setVisible: (value) => {
              visible = value
              layer?.setVisible(value)
            },
            destroy: () => layer?.setVisible(false)
          }
        }).id
      } catch {
        // 忽略重复节点
      }
    }
    ctx.log.info(`地球注释已加载：${merged.annotation.label}，${items.length} 项`)
  }

  const feature: EarthAnnotationFeature = {
    name: defaultOptions.name ?? `earth-annotation-${defaultOptions.annotation.id}`,
    get annotation() {
      return defaultOptions.annotation
    },
    get items() {
      return items
    },
    install,
    setVisible(value) {
      visible = value
      layer?.setVisible(value)
      if (nodeId) ctxRef?.layerManager?.setVisible(nodeId, value)
    },
    dispose() {
      disposed = true
      if (nodeId && ctxRef?.layerManager?.get(nodeId)) {
        ctxRef.layerManager.remove(nodeId, { removeSource: false })
      }
      nodeId = undefined
      layer?.destroy()
      layer = null
      items = []
      ctxRef = null
    }
  }

  return feature
}
