import type * as Cesium from 'cesium'
import type { DrawDraft, DrawResult, DrawType } from './draw/types'
import type { LayerChangePayload } from './layer/types'

/** 经度、纬度、高度（米）。高度缺省时按 0 处理。 */
export interface LonLatHeight {
  lon: number
  lat: number
  height?: number
}

/** 相机视角，角度单位为度。 */
export interface CameraView {
  lon: number
  lat: number
  height: number
  heading: number
  pitch: number
  roll: number
}

export type SceneModeName = '3D' | '2D' | 'COLUMBUS_VIEW'

/** 颜色可传 CSS 字符串（如 `#409eff`）或 Cesium.Color 实例。 */
export type ColorInput = string | Cesium.Color

/** 位置可传经纬高对象或 Cesium.Cartesian3。 */
export type PositionInput = LonLatHeight | Cesium.Cartesian3

/** 矩形范围，单位为度。 */
export interface BoundsInput {
  west: number
  south: number
  east: number
  north: number
}

/** 运行时错误来源，用于区分内核各模块与业务插件。 */
export type CesiumKitErrorSource =
  | 'datasource'
  | 'tileset'
  | 'viewer'
  | 'imagery'
  | 'terrain'
  | 'camera'
  | 'scene'
  | 'feature'
  | 'assets'
  | 'draw'
  | 'layer'
  | 'popup'
  | 'cluster'

export interface CesiumKitErrorPayload {
  resourceId?: string
  source: CesiumKitErrorSource
  error: unknown
  /** 可执行的修复建议 */
  detail?: string
}

export interface ClockState {
  currentTime: Date
  startTime: Date | null
  stopTime: Date | null
  multiplier: number
  running: boolean
  loop: boolean
}

export interface CesiumKitEventMap {
  'resource:change': { source: 'datasource' | 'tileset'; id: string; action: 'remove' | 'style' }
  'draw:remove': { id: string }
  ready: import('./viewer/CesiumViewerManager').CesiumViewerManager
  destroyed: undefined
  error: CesiumKitErrorPayload
  'camera:change': CameraView
  'imagery:change': { id: string | null }
  'imagery:update': { id: string }
  'scene:mode': SceneModeName
  'clock:tick': { currentTime: Date }
  'clock:state': ClockState
  'feature:registered': string
  'feature:unregistered': string
  'feature:error': { name: string; error: unknown }
  'draw:start': { id: string; type: DrawType }
  'draw:update': DrawDraft
  'draw:complete': DrawResult
  'draw:cancel': { id: string }
  'layer:change': LayerChangePayload
}
