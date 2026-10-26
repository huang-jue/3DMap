import type * as Cesium from 'cesium'
import type { EventBus } from '../events/EventBus'
import type { CesiumKitEventMap, ColorInput, LonLatHeight, PositionInput } from '../types'

export type DrawType = 'point' | 'polyline' | 'polygon' | 'rectangle' | 'circle' | 'height'

export interface DrawStyle {
  pointColor?: ColorInput
  pointSize?: number
  lineColor?: ColorInput
  lineWidth?: number
  polygonColor?: ColorInput
  polygonOutlineColor?: ColorInput
  polygonOutlineWidth?: number
  dashed?: boolean
  clampToGround?: boolean
}

export interface DrawMeasurementOptions {
  distance?: boolean
  area?: boolean
  height?: boolean
  segmentLabels?: boolean
  decimals?: number
}

export interface MeasurementSummary {
  distance?: number
  perimeter?: number
  area?: number
  heightDiff?: number
  radius?: number
  width?: number
  height?: number
}

export interface DrawDraft {
  id: string
  type: DrawType
  positions: LonLatHeight[]
  measurement: MeasurementSummary
}

export interface DrawResult extends DrawDraft {
  entity: Cesium.Entity
  cartesianPositions: Cesium.Cartesian3[]
}

export interface DrawOptions {
  id?: string
  name?: string
  clampToGround?: boolean
  style?: DrawStyle
  measure?: boolean | DrawMeasurementOptions
  editable?: boolean
  onUpdate?: (draft: DrawDraft) => void
  onComplete?: (result: DrawResult) => void
  onCancel?: () => void
}

export type DrawState = 'drawing' | 'completed' | 'cancelled'

export interface DrawSession {
  readonly id: string
  readonly type: DrawType
  readonly state: DrawState
  readonly result: DrawResult | null
  readonly positions: Cesium.Cartesian3[]
  readonly editable: boolean
  finish(): void
  cancel(): void
  remove(): void
  setEditable(editable: boolean): void
  updateVertex(index: number, position: PositionInput): void
}

export interface EntitySink {
  add(entity: Cesium.Entity): Cesium.Entity
  remove(entity: Cesium.Entity): void
}

export interface PickToggle {
  setEnabled(enabled: boolean): void
  isEnabled(): boolean
}

export interface DrawEventHandlerLike {
  setInputAction(action: (event: unknown) => void, type: number): void
  destroy(): void
  isDestroyed?(): boolean
}

export interface DrawServiceOptions {
  sink?: EntitySink
  pick?: PickToggle
  events?: EventBus<CesiumKitEventMap>
  createHandler?: (canvas: HTMLCanvasElement) => DrawEventHandlerLike
  requestRender?: () => void
  keyboardTarget?: Pick<Document, 'addEventListener' | 'removeEventListener'>
  logger?: import('../utils/logger').Logger
}
