export type LayerKind =
  | 'group'
  | 'imagery'
  | 'datasource'
  | 'tileset'
  | 'entities'
  | 'custom'

export type LayerChangeAction =
  | 'add'
  | 'remove'
  | 'move'
  | 'visibility'
  | 'alpha'
  | 'clear'

export interface LayerChangePayload {
  action: LayerChangeAction
  id: string
  parentId?: string
}

export interface LayerNode {
  id: string
  name: string
  kind: LayerKind
  parentId: string | null
  visible: boolean
  effectiveVisible: boolean
  alpha: number
  effectiveAlpha: number
  sourceId?: string
  entityCount?: number
  children: LayerNode[]
}

export interface LayerNodeOptions {
  id?: string
  name?: string
  parentId?: string
  index?: number
  visible?: boolean
  alpha?: number
}

export interface LayerClusteringOptions {
  enabled?: boolean
  pixelRange?: number
  minimumClusterSize?: number
  clusterBillboards?: boolean
  clusterLabels?: boolean
  clusterPoints?: boolean
}

export interface LayerEntityGroupOptions extends LayerNodeOptions {
  clustering?: LayerClusteringOptions | false
}

export interface LayerRemoveOptions {
  removeSource?: boolean
}

/**
 * 自定义图层句柄。用于把插件自管的图元（天气栅格、后处理等）纳入图层树。
 * 内核只负责级联显隐、透明度与销毁回调，不假设底层实现。
 */
export interface CustomLayerHandle {
  setVisible?: (visible: boolean) => void
  setAlpha?: (alpha: number) => void
  raiseToTop?: () => void
  destroy?: () => void
}

export interface AddCustomLayerOptions extends LayerNodeOptions {
  handle: CustomLayerHandle
}
