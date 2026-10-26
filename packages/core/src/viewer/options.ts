import type * as Cesium from 'cesium'
import type { CameraServiceOptions } from '../camera/CameraService'
import type { ClockOptions } from '../clock/ClockService'
import type { ImagerySource } from '../imagery/ImageryManager'
import type { TerrainInput } from '../terrain/TerrainManager'
import type { BoundsInput, PositionInput } from '../types'
import type { LogLevel } from '../utils/logger'
import type { VerifyAssetsOptions } from '../utils/verifyAssets'

export interface ImageryConfig {
  source: ImagerySource
  id?: string
  show?: boolean
  alpha?: number
}

export interface CesiumKitOptions {
  /** Cesium ion token，不传则使用 Cesium 默认 token */
  ionToken?: string
  /**
   * Cesium 静态资源根路径，例如 `/cesium`。
   * 使用 `@cesium-kit/vite` 插件时可不传。
   */
  cesiumBaseUrl?: string
  /** 直接透传给 new Cesium.Viewer 的额外选项，优先级最高 */
  viewerOptions?: Cesium.Viewer.ConstructorOptions

  animation?: boolean
  timeline?: boolean
  geocoder?: boolean
  homeButton?: boolean
  sceneModePicker?: boolean
  baseLayerPicker?: boolean
  navigationHelpButton?: boolean
  fullscreenButton?: boolean
  infoBox?: boolean
  selectionIndicator?: boolean
  shouldAnimate?: boolean

  /** 是否显示 Cesium 版权信息，默认 true */
  showCredits?: boolean
  enableLighting?: boolean
  depthTestAgainstTerrain?: boolean
  skyAtmosphere?: boolean
  fog?: boolean
  /** 天空盒（含星空），默认 Cesium 行为 */
  skyBox?: boolean
  sun?: boolean
  moon?: boolean
  /** false 表示不创建地球，仅显示空间物体 */
  globe?: boolean
  /** 截图所需，开启后 canvas.toDataURL 可用，默认 false */
  preserveDrawingBuffer?: boolean

  /** 启动时探测 Cesium 静态资源，可通过 error 事件拿到结果，默认 false */
  verifyAssets?: boolean | VerifyAssetsOptions

  /** 初始底图，false 表示不加载任何底图 */
  imagery?: ImageryConfig[] | false
  /** 初始地形，默认 'ellipsoid' */
  terrain?: TerrainInput

  /** 复位视角，默认中国全域 */
  homeView?: PositionInput | BoundsInput | null
  homeOrientation?: { heading?: number; pitch?: number; roll?: number }

  camera?: CameraServiceOptions

  /** 时间轴初始配置 */
  clock?: ClockOptions

  /** 按需渲染，默认 false */
  requestRenderMode?: boolean
  /** 按需渲染的最大间隔（秒） */
  maximumRenderTimeChange?: number

  /** 日志级别，默认 'warn' */
  logLevel?: LogLevel
}

export interface ResolvedCesiumKitOptions extends CesiumKitOptions {
  animation: boolean
  timeline: boolean
  geocoder: boolean
  homeButton: boolean
  sceneModePicker: boolean
  baseLayerPicker: boolean
  navigationHelpButton: boolean
  fullscreenButton: boolean
  infoBox: boolean
  selectionIndicator: boolean
  shouldAnimate: boolean
  showCredits: boolean
  enableLighting: boolean
  depthTestAgainstTerrain: boolean
  skyAtmosphere: boolean
  fog: boolean
  preserveDrawingBuffer: boolean
  imagery: ImageryConfig[] | false
  terrain: TerrainInput
  homeView: PositionInput | BoundsInput | null
  requestRenderMode: boolean
}

export const defaultOptions: Omit<ResolvedCesiumKitOptions, 'ionToken' | 'cesiumBaseUrl'> = {
  animation: false,
  timeline: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  baseLayerPicker: false,
  navigationHelpButton: false,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
  shouldAnimate: true,
  showCredits: true,
  enableLighting: false,
  depthTestAgainstTerrain: true,
  skyAtmosphere: true,
  fog: true,
  preserveDrawingBuffer: false,
  imagery: [
    { source: 'naturalEarth', id: 'naturalEarth', show: true },
    { source: 'osm', id: 'osm', show: false }
  ],
  terrain: 'ellipsoid',
  homeView: { lon: 104, lat: 30, height: 12000000 },
  requestRenderMode: false
}

export function resolveOptions(options: CesiumKitOptions = {}): ResolvedCesiumKitOptions {
  return {
    ...defaultOptions,
    ...options,
    imagery: options.imagery === undefined ? defaultOptions.imagery : options.imagery,
    viewerOptions: options.viewerOptions
  }
}
