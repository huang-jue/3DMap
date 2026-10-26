export type LayerKind = 'group' | 'imagery' | 'datasource' | 'tileset' | 'entities'

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
