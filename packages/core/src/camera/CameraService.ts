import * as Cesium from 'cesium'
import type { EventBus } from '../events/EventBus'
import type { BoundsInput, CameraView, CesiumKitEventMap, PositionInput } from '../types'
import { createLogger, type Logger } from '../utils/logger'
import { buildShareUrl, decodeCameraState } from './share'

export interface HomeView {
  destination: Cesium.Cartesian3
  orientation: Cesium.HeadingPitchRollValues
}

export function createHomeView(
  target: PositionInput | BoundsInput = { lon: 104, lat: 30, height: 12000000 },
  orientation: { heading?: number; pitch?: number; roll?: number } = {}
): HomeView {
  return {
    destination: toDestination(target) as Cesium.Cartesian3,
    orientation: {
      heading: Cesium.Math.toRadians(orientation.heading ?? 0),
      pitch: Cesium.Math.toRadians(orientation.pitch ?? -90),
      roll: Cesium.Math.toRadians(orientation.roll ?? 0)
    }
  }
}

function isBounds(input: PositionInput | BoundsInput): input is BoundsInput {
  return 'west' in input
}

function toDestination(target: PositionInput | BoundsInput): Cesium.Cartesian3 | Cesium.Rectangle {
  if (isBounds(target)) {
    return Cesium.Rectangle.fromDegrees(target.west, target.south, target.east, target.north)
  }
  if (target instanceof Cesium.Cartesian3) return target
  return Cesium.Cartesian3.fromDegrees(target.lon, target.lat, target.height ?? 0)
}

export interface FlyToOptions {
  duration?: number
  /** 角度制 */
  heading?: number
  /** 角度制，默认 -90（垂直俯视） */
  pitch?: number
  /** 角度制 */
  roll?: number
  complete?: () => void
  cancel?: () => void
}

export type CameraTarget =
  | PositionInput
  | BoundsInput
  | Cesium.Cartesian3
  | {
      destination: Cesium.Cartesian3 | Cesium.Rectangle
      orientation?: Partial<Cesium.HeadingPitchRollValues>
    }

export interface CameraServiceOptions {
  /** 相机变化触发阈值，0-1，默认 0.01 */
  percentageChanged?: number
  /** 是否自动派发 camera:change 事件，默认 true */
  trackChanges?: boolean
  /** 初始视角约束 */
  constraints?: CameraConstraints
}

export interface CameraConstraints {
  /** 最低相机高度（米） */
  minHeight?: number
  /** 最高相机高度（米） */
  maxHeight?: number
  /** 最小俯仰角（度） */
  minPitch?: number
  /** 最大俯仰角（度） */
  maxPitch?: number
}

export class CameraService {
  private home: HomeView | null
  private tracking: boolean
  private destroyed = false
  private log: Logger
  private constraints: CameraConstraints = {}
  private applyingConstraint = false
  private readonly handleChange = (): void => {
    this.events.emit('camera:change', this.getView())
  }
  private readonly handleConstraint = (): void => {
    this.applyConstraints()
  }

  constructor(
    private readonly viewer: Cesium.Viewer,
    private readonly events: EventBus<CesiumKitEventMap>,
    options: CameraServiceOptions = {},
    home: HomeView | null = createHomeView(),
    logger?: Logger
  ) {
    this.home = home
    this.log = logger ?? createLogger('camera')
    this.tracking = options.trackChanges ?? true
    if (this.tracking) {
      viewer.camera.percentageChanged = options.percentageChanged ?? 0.01
      viewer.camera.changed.addEventListener(this.handleChange)
    }
    viewer.camera.changed.addEventListener(this.handleConstraint)
    if (options.constraints) this.setConstraints(options.constraints)
  }

  /** 当前相机视角，角度为度。2D/哥伦布视图下部分角度无意义，统一回退为 0。 */
  getView(): CameraView {
    const camera = this.viewer.camera
    const carto = camera.positionCartographic
    const degrees = (value: number | undefined | null): number =>
      Number.isFinite(value as number) ? Cesium.Math.toDegrees(value as number) : 0

    return {
      lon: degrees(carto?.longitude),
      lat: degrees(carto?.latitude),
      height: Number.isFinite(carto?.height) ? (carto?.height as number) : 0,
      heading: degrees(camera.heading),
      pitch: degrees(camera.pitch),
      roll: degrees(camera.roll)
    }
  }

  /** 飞行到指定位置/范围。 */
  flyTo(target: CameraTarget, options: FlyToOptions = {}): void {
    if (this.destroyed || this.viewer.isDestroyed()) return
    const { destination, orientation } = this.normalize(target, options)
    this.viewer.camera.flyTo({
      destination,
      orientation,
      duration: options.duration ?? 1.5,
      complete: options.complete,
      cancel: options.cancel
    })
  }

  /** 瞬时定位，无飞行动画。 */
  setView(target: CameraTarget, options: FlyToOptions = {}): void {
    if (this.destroyed || this.viewer.isDestroyed()) return
    const { destination, orientation } = this.normalize(target, options)
    this.viewer.camera.setView({ destination, orientation })
    this.events.emit('camera:change', this.getView())
  }

  flyHome(duration = 1.5): void {
    if (this.viewer.isDestroyed()) return
    if (!this.home) {
      this.log.warn('未配置复位视角（homeView 为 null），flyHome 已忽略')
      return
    }
    this.viewer.camera.flyTo({
      destination: this.home.destination,
      orientation: this.home.orientation,
      duration
    })
  }

  setHome(target: PositionInput | BoundsInput, orientation?: FlyToOptions): void {
    this.home = createHomeView(target, orientation)
  }

  hasHome(): boolean {
    return this.home !== null
  }

  /** 订阅相机变化，返回取消订阅函数。 */
  onChange(handler: (view: CameraView) => void): () => void {
    return this.events.on('camera:change', handler)
  }

  setTracking(enabled: boolean, percentageChanged?: number): void {
    if (enabled === this.tracking) return
    this.tracking = enabled
    if (enabled) {
      if (percentageChanged !== undefined) {
        this.viewer.camera.percentageChanged = percentageChanged
      }
      this.viewer.camera.changed.addEventListener(this.handleChange)
    } else {
      this.viewer.camera.changed.removeEventListener(this.handleChange)
    }
  }

  /** 设置视角约束：高度映射到缩放距离，俯仰在相机变化时夹取。 */
  setConstraints(constraints: CameraConstraints): void {
    this.constraints = { ...this.constraints, ...constraints }

    const controller = this.viewer.scene.screenSpaceCameraController
    if (constraints.minHeight !== undefined) {
      controller.minimumZoomDistance = Math.max(0, constraints.minHeight)
    }
    if (constraints.maxHeight !== undefined) {
      controller.maximumZoomDistance = constraints.maxHeight
    }
    this.applyConstraints()
  }

  getConstraints(): CameraConstraints {
    return { ...this.constraints }
  }

  /** 关闭后可钻入地下，默认 Cesium 已开启碰撞检测。 */
  setCollisionDetection(enabled: boolean): void {
    this.viewer.scene.screenSpaceCameraController.enableCollisionDetection = enabled
  }

  /** 生成可分享的视角链接；不传 baseUrl 时返回 hash 片段。 */
  getShareUrl(baseUrl?: string): string {
    return buildShareUrl(this.getView(), baseUrl)
  }

  /** 从 URL 或 hash 还原视角，成功返回 true。 */
  applyFromUrl(url?: string): boolean {
    const input = url ?? (typeof location !== 'undefined' ? location.href : '')
    const state = decodeCameraState(input)
    if (!state) return false
    this.setView(state)
    return true
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    if (this.viewer.isDestroyed()) return
    this.viewer.camera.changed.removeEventListener(this.handleConstraint)
    if (this.tracking) {
      this.viewer.camera.changed.removeEventListener(this.handleChange)
    }
  }

  private applyConstraints(): void {
    if (this.applyingConstraint || this.destroyed || this.viewer.isDestroyed()) return
    const { minPitch, maxPitch, minHeight, maxHeight } = this.constraints
    if (
      minPitch === undefined &&
      maxPitch === undefined &&
      minHeight === undefined &&
      maxHeight === undefined
    ) {
      return
    }

    const view = this.getView()
    const next = { ...view }
    if (minPitch !== undefined && next.pitch < minPitch) next.pitch = minPitch
    if (maxPitch !== undefined && next.pitch > maxPitch) next.pitch = maxPitch
    if (minHeight !== undefined && next.height < minHeight) next.height = minHeight
    if (maxHeight !== undefined && next.height > maxHeight) next.height = maxHeight

    const changed = next.pitch !== view.pitch || next.height !== view.height
    if (!changed) return

    this.applyingConstraint = true
    try {
      this.viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(next.lon, next.lat, next.height),
        orientation: {
          heading: Cesium.Math.toRadians(next.heading),
          pitch: Cesium.Math.toRadians(next.pitch),
          roll: Cesium.Math.toRadians(next.roll)
        }
      })
    } finally {
      this.applyingConstraint = false
    }
  }

  private normalize(
    target: CameraTarget,
    options: FlyToOptions
  ): {
    destination: Cesium.Cartesian3 | Cesium.Rectangle
    orientation: Cesium.HeadingPitchRollValues
  } {
    let destination: Cesium.Cartesian3 | Cesium.Rectangle
    let orientation: Cesium.HeadingPitchRollValues = {
      heading: Cesium.Math.toRadians(options.heading ?? 0),
      pitch: Cesium.Math.toRadians(options.pitch ?? -90),
      roll: Cesium.Math.toRadians(options.roll ?? 0)
    }

    if ('destination' in target) {
      destination = target.destination
      if (target.orientation) orientation = { ...orientation, ...target.orientation }
    } else {
      destination = toDestination(target as PositionInput | BoundsInput)
    }

    return { destination, orientation }
  }
}
