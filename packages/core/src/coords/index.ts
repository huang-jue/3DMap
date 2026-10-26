import * as Cesium from 'cesium'
import type { BoundsInput, LonLatHeight, PositionInput } from '../types'

/** 经纬度（度）+ 高度（米）转 Cartesian3。 */
export function toCartesian(lon: number, lat: number, height = 0): Cesium.Cartesian3 {
  return Cesium.Cartesian3.fromDegrees(lon, lat, height)
}

/** Cartesian3 转经纬度（度）+ 高度（米）。 */
export function toDegrees(cartesian: Cesium.Cartesian3): LonLatHeight {
  const carto = Cesium.Cartographic.fromCartesian(cartesian)
  if (!carto) return { lon: 0, lat: 0, height: 0 }
  return {
    lon: Cesium.Math.toDegrees(carto.longitude),
    lat: Cesium.Math.toDegrees(carto.latitude),
    height: carto.height
  }
}

/** 把 PositionInput 统一转换为 Cartesian3。 */
export function resolvePosition(input: PositionInput): Cesium.Cartesian3 {
  if (input instanceof Cesium.Cartesian3) return input
  return toCartesian(input.lon, input.lat, input.height ?? 0)
}

export function resolvePositions(input: PositionInput[]): Cesium.Cartesian3[] {
  return input.map(resolvePosition)
}

/** 矩形范围（度）转 Cesium.Rectangle。 */
export function toRectangle(bounds: BoundsInput): Cesium.Rectangle {
  return Cesium.Rectangle.fromDegrees(bounds.west, bounds.south, bounds.east, bounds.north)
}

/** 贴地/地形高度查询结果，单位为米。 */
export function sampleHeight(viewer: Cesium.Viewer, input: PositionInput): number | undefined {
  if (viewer.isDestroyed()) return undefined
  const position = resolvePosition(input)
  const carto = Cesium.Cartographic.fromCartesian(position)
  if (!carto) return undefined
  const height = viewer.scene.globe.getHeight(carto)
  return height ?? undefined
}

export interface ScreenPosition {
  x: number
  y: number
  visible: boolean
}

export interface PickResult {
  position: Cesium.Cartesian3
  lonLatHeight: LonLatHeight
  /** 拾取方式，便于排查 2D/3D 差异 */
  source: 'scene' | 'ray' | 'ellipsoid'
}

export function toScreen(
  viewer: Cesium.Viewer,
  input: PositionInput
): ScreenPosition | undefined {
  if (viewer.isDestroyed()) return undefined
  const position = resolvePosition(input)
  const scene = viewer.scene
  const point = Cesium.SceneTransforms.worldToWindowCoordinates(scene, position)
  if (!point) return undefined
  const canvas = scene.canvas
  return {
    x: point.x,
    y: point.y,
    visible:
      point.x >= 0 &&
      point.y >= 0 &&
      point.x <= (canvas.clientWidth || canvas.width) &&
      point.y <= (canvas.clientHeight || canvas.height)
  }
}

function buildPick(position: Cesium.Cartesian3, source: PickResult['source']): PickResult {
  return { position, lonLatHeight: toDegrees(position), source }
}

/**
 * 从屏幕坐标拾取地表位置，3D / 2D / 哥伦布视图均可用。
 *
 * 回退顺序：
 * 1. 3D 且支持深度拾取：`scene.pickPosition`（可命中地形、模型、3D Tiles）
 * 2. 3D：射线与地球求交 `globe.pick`
 * 3. 2D / 哥伦布 / 兜底：`camera.pickEllipsoid`（2D 下 `globe.pick` 不可用）
 */
export function pickPosition(
  viewer: Cesium.Viewer,
  windowPosition?: Cesium.Cartesian2
): PickResult | undefined {
  if (viewer.isDestroyed()) return undefined
  const scene = viewer.scene
  const canvas = scene.canvas
  const screen =
    windowPosition ?? new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2)
  const is3D = scene.mode === Cesium.SceneMode.SCENE3D

  if (is3D && scene.pickPositionSupported) {
    const picked = scene.pickPosition(screen)
    if (picked) return buildPick(picked, 'scene')
  }

  if (is3D) {
    const ray = viewer.camera.getPickRay(screen)
    if (ray) {
      const picked = scene.globe.pick(ray, scene)
      if (picked) return buildPick(picked, 'ray')
    }
  }

  const ellipsoid = scene.globe?.ellipsoid ?? Cesium.Ellipsoid.WGS84
  const picked = viewer.camera.pickEllipsoid(screen, ellipsoid)
  if (picked) return buildPick(picked, 'ellipsoid')

  return undefined
}

export interface CoordService {
  toCartesian(lon: number, lat: number, height?: number): Cesium.Cartesian3
  toDegrees(cartesian: Cesium.Cartesian3): LonLatHeight
  toScreen(input: PositionInput): ScreenPosition | undefined
  pickPosition(windowPosition?: Cesium.Cartesian2): PickResult | undefined
  sampleHeight(input: PositionInput): number | undefined
  toRectangle(bounds: BoundsInput): Cesium.Rectangle
}

export function createCoordService(viewer: Cesium.Viewer): CoordService {
  return {
    toCartesian,
    toDegrees,
    toScreen: (input) => toScreen(viewer, input),
    pickPosition: (windowPosition) => pickPosition(viewer, windowPosition),
    sampleHeight: (input) => sampleHeight(viewer, input),
    toRectangle
  }
}
