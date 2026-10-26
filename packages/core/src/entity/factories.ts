import * as Cesium from 'cesium'
import type { ColorInput, PositionInput } from '../types'
import { toColor } from '../utils/color'
import { resolvePosition, resolvePositions } from '../coords'

export interface EntityBaseOptions {
  id?: string
  name?: string
  description?: string
  show?: boolean
  properties?: Record<string, unknown>
}

function base(options: EntityBaseOptions): Partial<Cesium.Entity.ConstructorOptions> {
  return {
    id: options.id,
    name: options.name,
    description: options.description,
    show: options.show ?? true,
    properties: options.properties
      ? new Cesium.PropertyBag(options.properties)
      : undefined
  }
}

export interface PointOptions extends EntityBaseOptions {
  position: PositionInput
  pixelSize?: number
  color?: ColorInput
  outlineColor?: ColorInput
  outlineWidth?: number
  /** 是否贴地，默认 false */
  clampToGround?: boolean
}

export function createPoint(options: PointOptions): Cesium.Entity {
  return new Cesium.Entity({
    ...base(options),
    position: resolvePosition(options.position),
    point: {
      pixelSize: options.pixelSize ?? 8,
      color: toColor(options.color ?? '#409eff'),
      outlineColor: toColor(options.outlineColor ?? '#ffffff'),
      outlineWidth: options.outlineWidth ?? 2,
      heightReference: options.clampToGround
        ? Cesium.HeightReference.CLAMP_TO_GROUND
        : Cesium.HeightReference.NONE
    }
  })
}

export type LabelStyleName = 'fill' | 'outline' | 'fill-and-outline'

const LABEL_STYLE: Record<LabelStyleName, Cesium.LabelStyle> = {
  fill: Cesium.LabelStyle.FILL,
  outline: Cesium.LabelStyle.OUTLINE,
  'fill-and-outline': Cesium.LabelStyle.FILL_AND_OUTLINE
}

export interface LabelOptions extends EntityBaseOptions {
  position: PositionInput
  text: string
  font?: string
  fillColor?: ColorInput
  outlineColor?: ColorInput
  outlineWidth?: number
  style?: LabelStyleName
  /** 屏幕像素偏移 [x, y] */
  pixelOffset?: [number, number]
  scale?: number
  clampToGround?: boolean
  backgroundColor?: ColorInput
  showBackground?: boolean
  /** 可见距离范围 [near, far]，单位米 */
  distanceDisplayCondition?: [number, number]
}

export function createLabel(options: LabelOptions): Cesium.Entity {
  return new Cesium.Entity({
    ...base(options),
    position: resolvePosition(options.position),
    label: {
      text: options.text,
      font: options.font ?? '14px sans-serif',
      fillColor: toColor(options.fillColor ?? '#ffffff'),
      outlineColor: toColor(options.outlineColor ?? '#000000'),
      outlineWidth: options.outlineWidth ?? 2,
      style: LABEL_STYLE[options.style ?? 'fill-and-outline'],
      pixelOffset: new Cesium.Cartesian2(...(options.pixelOffset ?? [0, 0])),
      scale: options.scale ?? 1,
      backgroundColor: options.backgroundColor
        ? toColor(options.backgroundColor)
        : undefined,
      showBackground: options.showBackground ?? false,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      distanceDisplayCondition: options.distanceDisplayCondition
        ? new Cesium.DistanceDisplayCondition(...options.distanceDisplayCondition)
        : undefined,
      heightReference: options.clampToGround
        ? Cesium.HeightReference.CLAMP_TO_GROUND
        : Cesium.HeightReference.NONE
    }
  })
}

export interface PolylineOptions extends EntityBaseOptions {
  positions: PositionInput[] | PositionInput
  width?: number
  color?: ColorInput
  /** 虚线，默认 false */
  dashed?: boolean
  /** 是否贴地，默认 false */
  clampToGround?: boolean
}

export function createPolyline(options: PolylineOptions): Cesium.Entity {
  const positions = Array.isArray(options.positions)
    ? options.positions
    : [options.positions]
  const color = toColor(options.color ?? '#409eff')
  return new Cesium.Entity({
    ...base(options),
    polyline: {
      positions: resolvePositions(positions),
      width: options.width ?? 3,
      clampToGround: options.clampToGround ?? false,
      material: options.dashed
        ? new Cesium.PolylineDashMaterialProperty({ color })
        : color
    }
  })
}

export interface PolygonOptions extends EntityBaseOptions {
  positions: PositionInput[]
  color?: ColorInput
  outline?: boolean
  outlineColor?: ColorInput
  outlineWidth?: number
  /** 拉伸高度（米） */
  extrudedHeight?: number
  /** 绝对高度（米） */
  height?: number
  /** 是否贴合地表，默认 false */
  clampToGround?: boolean
}

export function createPolygon(options: PolygonOptions): Cesium.Entity {
  return new Cesium.Entity({
    ...base(options),
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(resolvePositions(options.positions)),
      material: toColor(options.color ?? '#409eff').withAlpha(0.4),
      outline: options.outline ?? true,
      outlineColor: toColor(options.outlineColor ?? '#409eff'),
      outlineWidth: options.outlineWidth ?? 1,
      extrudedHeight: options.extrudedHeight,
      height: options.height,
      heightReference: options.clampToGround
        ? Cesium.HeightReference.CLAMP_TO_GROUND
        : Cesium.HeightReference.NONE
    }
  })
}

export interface ModelOptions extends EntityBaseOptions {
  position: PositionInput
  uri: string
  /** 缩放，默认 1 */
  scale?: number
  minimumPixelSize?: number
  maximumScale?: number
  /** 角度制 */
  heading?: number
  /** 角度制 */
  pitch?: number
  /** 角度制 */
  roll?: number
  clampToGround?: boolean
}

export function createModel(options: ModelOptions): Cesium.Entity {
  const position = resolvePosition(options.position)
  return new Cesium.Entity({
    ...base(options),
    position,
    orientation: Cesium.Transforms.headingPitchRollQuaternion(
      position,
      new Cesium.HeadingPitchRoll(
        Cesium.Math.toRadians(options.heading ?? 0),
        Cesium.Math.toRadians(options.pitch ?? 0),
        Cesium.Math.toRadians(options.roll ?? 0)
      )
    ),
    model: {
      uri: options.uri,
      scale: options.scale ?? 1,
      minimumPixelSize: options.minimumPixelSize,
      maximumScale: options.maximumScale,
      heightReference: options.clampToGround
        ? Cesium.HeightReference.CLAMP_TO_GROUND
        : Cesium.HeightReference.NONE
    }
  })
}
