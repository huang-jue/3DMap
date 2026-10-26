import * as Cesium from 'cesium'
import type { LonLatHeight } from '../types'
import type { DrawOptions, DrawType } from './types'

export type GeoJSONPosition = [number, number, number?]
export interface DrawGeoJSONFeature {
  type: 'Feature'
  id?: string | number
  geometry: {
    type: 'Point' | 'LineString' | 'Polygon'
    coordinates: GeoJSONPosition | GeoJSONPosition[] | GeoJSONPosition[][]
  }
  properties: Record<string, unknown> | null
}
export interface DrawGeoJSON {
  type: 'FeatureCollection'
  features: DrawGeoJSONFeature[]
}
export interface ImportedDraw {
  type: DrawType
  positions: LonLatHeight[]
  options: DrawOptions
}

function coordinate(value: unknown): LonLatHeight {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    value.length > 3 ||
    !value.every((n) => typeof n === 'number' && Number.isFinite(n)) ||
    Math.abs(value[0]) > 180 ||
    Math.abs(value[1]) > 90
  )
    throw new Error('非法 GeoJSON 坐标')
  return { lon: value[0], lat: value[1], height: value[2] ?? 0 }
}

function positions(value: unknown): LonLatHeight[] {
  if (!Array.isArray(value)) throw new Error('GeoJSON 坐标必须是数组')
  return value.map(coordinate)
}

export function validateDrawGeoJSON(input: unknown): ImportedDraw[] {
  const data = typeof input === 'string' ? JSON.parse(input) : input
  if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    throw new Error('需要 GeoJSON FeatureCollection')
  }
  return data.features.map((feature: DrawGeoJSONFeature): ImportedDraw => {
    if (!feature || feature.type !== 'Feature' || !feature.geometry)
      throw new Error('非法 GeoJSON Feature')
    const geometry = feature.geometry
    let points: LonLatHeight[]
    let type: DrawType
    if (geometry.type === 'Point') {
      type = 'point'
      points = [coordinate(geometry.coordinates)]
    } else if (geometry.type === 'LineString') {
      type = 'polyline'
      points = positions(geometry.coordinates)
    } else if (geometry.type === 'Polygon') {
      type = 'polygon'
      if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length !== 1)
        throw new Error('仅支持无孔 Polygon')
      points = positions(geometry.coordinates[0])
      if (
        points.length < 4 ||
        JSON.stringify(points[0]) !== JSON.stringify(points[points.length - 1])
      )
        throw new Error('Polygon 环必须闭合且至少四个坐标')
      points.pop()
    } else throw new Error(`不支持的几何类型：${geometry.type}`)
    const metadata = feature.properties?.cesiumKit as Record<string, unknown> | undefined
    const options: DrawOptions = {
      name: typeof feature.properties?.name === 'string' ? feature.properties.name : undefined
    }
    if (metadata !== undefined) {
      if (!metadata || metadata.version !== 1) throw new Error('不支持的绘制元数据版本')
      const originalType = metadata.type as DrawType
      const expected =
        originalType === 'point'
          ? 'Point'
          : ['polyline', 'height'].includes(originalType)
            ? 'LineString'
            : 'Polygon'
      if (
        !['point', 'polyline', 'polygon', 'rectangle', 'circle', 'height'].includes(originalType) ||
        expected !== geometry.type
      )
        throw new Error('绘制类型与几何类型不匹配')
      type = originalType
      points = positions(metadata.controlPoints)
      if (metadata.editable !== undefined && typeof metadata.editable !== 'boolean')
        throw new Error('非法 editable')
      options.editable = metadata.editable as boolean | undefined
      if (metadata.style !== undefined) {
        if (!metadata.style || typeof metadata.style !== 'object' || Array.isArray(metadata.style))
          throw new Error('非法绘制样式')
        const style: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(metadata.style)) {
          if (['pointColor', 'lineColor', 'polygonColor', 'polygonOutlineColor'].includes(key)) {
            if (typeof value !== 'string' || !Cesium.Color.fromCssColorString(value))
              throw new Error('非法颜色')
          } else if (['pointSize', 'lineWidth', 'polygonOutlineWidth'].includes(key)) {
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
              throw new Error('非法样式数值')
          } else if (['dashed', 'clampToGround'].includes(key)) {
            if (typeof value !== 'boolean') throw new Error('非法样式开关')
          } else throw new Error(`不支持的样式字段：${key}`)
          style[key] = value
        }
        options.style = style
      }
      if (metadata.measure !== undefined) {
        const measure = metadata.measure
        if (typeof measure === 'boolean') options.measure = measure
        else {
          if (!measure || typeof measure !== 'object' || Array.isArray(measure))
            throw new Error('非法量算配置')
          for (const [key, value] of Object.entries(measure)) {
            if (key === 'decimals') {
              if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 20)
                throw new Error('非法小数位数')
            } else if (
              !['distance', 'area', 'height', 'segmentLabels'].includes(key) ||
              typeof value !== 'boolean'
            )
              throw new Error('非法量算配置')
          }
          options.measure = measure
        }
      }
    }
    const min = type === 'point' ? 1 : type === 'polygon' ? 3 : 2
    if (
      points.length < min ||
      (['point', 'rectangle', 'circle', 'height'].includes(type) && points.length !== min)
    )
      throw new Error('绘制控制点数量不正确')
    return { type, positions: points, options }
  })
}

export function geoJSONPosition(position: LonLatHeight): GeoJSONPosition {
  return [position.lon, position.lat, position.height ?? 0]
}

/** Approximate the same ellipsoidal circle with a closed sampled ring. */
export function circleRing(center: LonLatHeight, edge: LonLatHeight): GeoJSONPosition[] {
  const a = Cesium.Cartographic.fromDegrees(center.lon, center.lat)
  const b = Cesium.Cartographic.fromDegrees(edge.lon, edge.lat)
  const radius = new Cesium.EllipsoidGeodesic(a, b).surfaceDistance
  const ellipsoid = Cesium.Ellipsoid.WGS84
  const geometry = new Cesium.EllipseOutlineGeometry({
    center: ellipsoid.cartographicToCartesian(a),
    semiMajorAxis: Math.max(radius, 0.01),
    semiMinorAxis: Math.max(radius, 0.01),
    height: center.height ?? 0,
    granularity: Math.PI / 32
  })
  const values = Cesium.EllipseOutlineGeometry.createGeometry(geometry)?.attributes.position?.values
  if (!values) throw new Error('无法生成圆形边界')
  const ring: GeoJSONPosition[] = []
  for (let i = 0; i < values.length; i += 3) {
    const carto = ellipsoid.cartesianToCartographic(
      new Cesium.Cartesian3(values[i], values[i + 1], values[i + 2])
    )
    ring.push([
      Cesium.Math.toDegrees(carto.longitude),
      Cesium.Math.toDegrees(carto.latitude),
      carto.height
    ])
  }
  ring.push(ring[0]!)
  return ring
}
