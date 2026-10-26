import type * as Cesium from 'cesium'
import type { PickService } from '../pick/PickService'
import type { ColorInput, PositionInput } from '../types'

export interface MarkerInput {
  id?: string
  position: PositionInput
  name?: string
  label?: string
  color?: ColorInput
  size?: number
  icon?: string | HTMLCanvasElement
  clampToGround?: boolean
  data?: Record<string, unknown>
}

export interface MarkerClusteringOptions {
  pixelRange?: number
  minimumClusterSize?: number
  clusterBillboards?: boolean
  clusterLabels?: boolean
  clusterPoints?: boolean
  clusterEnabled?: boolean
}

export interface ClusterGraphics {
  label: Cesium.Label
  billboard: Cesium.Billboard
  point: Cesium.PointPrimitive
}

export interface MarkerClusterOptions {
  id?: string
  name?: string
  dataSource?: Cesium.CustomDataSource
  pixelRange?: number
  minimumClusterSize?: number
  clusterBillboards?: boolean
  clusterLabels?: boolean
  clusterPoints?: boolean
  clusterEnabled?: boolean
  clusterColor?: ColorInput
  clusterLabel?: (count: number) => string
  defaultClusterAction?: 'zoom' | 'none'
  pick?: PickService
  onMarkerClick?: (marker: MarkerInput, entity: Cesium.Entity) => void
  onClusterClick?: (
    markers: MarkerInput[],
    entities: Cesium.Entity[],
    cluster?: ClusterGraphics
  ) => void
}
