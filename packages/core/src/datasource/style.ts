import * as Cesium from 'cesium'
import type { ColorInput } from '../types'
import { toColor } from '../utils/color'

/** 数据源样式，按几何类型分派到对应实体。 */
export interface DataSourceStyle {
  pointColor?: ColorInput
  pointSize?: number
  pointOutlineColor?: ColorInput
  pointOutlineWidth?: number
  lineColor?: ColorInput
  lineWidth?: number
  polygonColor?: ColorInput
  polygonOutlineColor?: ColorInput
  labelColor?: ColorInput
  labelFont?: string
  /** 点/线/标签贴地 */
  clampToGround?: boolean
}

function constant<T>(value: T): Cesium.ConstantProperty {
  return new Cesium.ConstantProperty(value)
}

/** 把统一风格应用到数据源内的所有实体。 */
export function applyDataSourceStyle(
  dataSource: Cesium.DataSource,
  style: DataSourceStyle
): void {
  const clamp = style.clampToGround
  const entities = dataSource.entities.values

  for (const entity of entities) {
    if (entity.point) {
      if (style.pointColor) {
        entity.point.color = new Cesium.ColorMaterialProperty(toColor(style.pointColor))
      }
      if (style.pointSize !== undefined) {
        entity.point.pixelSize = constant(style.pointSize)
      }
      if (style.pointOutlineColor) {
        entity.point.outlineColor = constant(toColor(style.pointOutlineColor))
      }
      if (style.pointOutlineWidth !== undefined) {
        entity.point.outlineWidth = constant(style.pointOutlineWidth)
      }
      if (clamp !== undefined) {
        entity.point.heightReference = constant(
          clamp ? Cesium.HeightReference.CLAMP_TO_GROUND : Cesium.HeightReference.NONE
        )
      }
    }

    if (entity.polyline) {
      if (style.lineColor) {
        entity.polyline.material = new Cesium.ColorMaterialProperty(toColor(style.lineColor))
      }
      if (style.lineWidth !== undefined) {
        entity.polyline.width = constant(style.lineWidth)
      }
      if (clamp !== undefined) {
        entity.polyline.clampToGround = constant(clamp)
      }
    }

    if (entity.polygon) {
      if (style.polygonColor) {
        entity.polygon.material = new Cesium.ColorMaterialProperty(toColor(style.polygonColor))
      }
      if (style.polygonOutlineColor) {
        entity.polygon.outlineColor = constant(toColor(style.polygonOutlineColor))
        entity.polygon.outline = constant(true)
      }
    }

    if (entity.label) {
      if (style.labelColor) {
        entity.label.fillColor = constant(toColor(style.labelColor))
      }
      if (style.labelFont) {
        entity.label.font = constant(style.labelFont)
      }
      if (clamp !== undefined) {
        entity.label.heightReference = constant(
          clamp ? Cesium.HeightReference.CLAMP_TO_GROUND : Cesium.HeightReference.NONE
        )
      }
    }
  }
}
