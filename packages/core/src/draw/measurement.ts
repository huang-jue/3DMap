import * as Cesium from 'cesium'
import { resolvePosition } from '../coords'
import type { PositionInput } from '../types'
import type { MeasurementSummary } from './types'

const ELLIPSOID = Cesium.Ellipsoid.WGS84
const MEAN_RADIUS = (ELLIPSOID.maximumRadius * 2 + ELLIPSOID.minimumRadius) / 3

export interface DistanceMeasurement {
  distance: number
  segments: number[]
  heightDiff: number
}

export interface AreaMeasurement {
  area: number
  perimeter: number
}

export interface CircleMeasurement {
  radius: number
  area: number
  circumference: number
}

export interface RectangleMeasurement extends AreaMeasurement {
  width: number
  height: number
}

export interface MeasureOptions {
  surface?: boolean
}

function geodesicDistance(a: Cesium.Cartesian3, b: Cesium.Cartesian3): number {
  const from = Cesium.Cartographic.fromCartesian(a)
  const to = Cesium.Cartographic.fromCartesian(b)
  if (!from || !to) return Cesium.Cartesian3.distance(a, b)
  return new Cesium.EllipsoidGeodesic(from, to).surfaceDistance
}

export function measureDistance(
  positions: PositionInput[],
  options: MeasureOptions = {}
): DistanceMeasurement {
  const points = positions.map(resolvePosition)
  const segments: number[] = []
  let distance = 0
  const surface = options.surface !== false

  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1] as Cesium.Cartesian3
    const current = points[i] as Cesium.Cartesian3
    const value = surface
      ? geodesicDistance(previous, current)
      : Cesium.Cartesian3.distance(previous, current)
    segments.push(value)
    distance += value
  }

  const first = points[0] ? Cesium.Cartographic.fromCartesian(points[0]) : null
  const last = points.length > 0
    ? Cesium.Cartographic.fromCartesian(points[points.length - 1] as Cesium.Cartesian3)
    : null
  const heightDiff = (last?.height ?? 0) - (first?.height ?? 0)

  return { distance, segments, heightDiff }
}

export function measureArea(positions: PositionInput[]): AreaMeasurement {
  const points = positions.map(resolvePosition)
  if (points.length < 3) return { area: 0, perimeter: 0 }

  let perimeter = 0
  for (let i = 0; i < points.length; i += 1) {
    perimeter += geodesicDistance(
      points[i] as Cesium.Cartesian3,
      points[(i + 1) % points.length] as Cesium.Cartesian3
    )
  }

  const origin = averageCartographic(points)
  const up = ELLIPSOID.geodeticSurfaceNormal(origin, new Cesium.Cartesian3())
  const eastCross = Cesium.Cartesian3.cross(
    Cesium.Cartesian3.UNIT_Z,
    up,
    new Cesium.Cartesian3()
  )
  if (Cesium.Cartesian3.magnitudeSquared(eastCross) < 1e-12) {
    Cesium.Cartesian3.cross(Cesium.Cartesian3.UNIT_X, up, eastCross)
  }
  const east = Cesium.Cartesian3.normalize(eastCross, new Cesium.Cartesian3())
  const north = Cesium.Cartesian3.cross(up, east, new Cesium.Cartesian3())

  const local = points.map((point) => {
    const delta = Cesium.Cartesian3.subtract(
      point,
      origin,
      new Cesium.Cartesian3()
    )
    return {
      x: Cesium.Cartesian3.dot(delta, east),
      y: Cesium.Cartesian3.dot(delta, north)
    }
  })

  let doubleArea = 0
  for (let i = 0; i < local.length; i += 1) {
    const current = local[i] as { x: number; y: number }
    const next = local[(i + 1) % local.length] as { x: number; y: number }
    doubleArea += current.x * next.y - next.x * current.y
  }

  return { area: Math.abs(doubleArea) / 2, perimeter }
}

function averageCartographic(points: Cesium.Cartesian3[]): Cesium.Cartesian3 {
  let lon = 0
  let lat = 0
  let height = 0
  let count = 0
  points.forEach((point) => {
    const carto = Cesium.Cartographic.fromCartesian(point)
    if (!carto) return
    lon += carto.longitude
    lat += carto.latitude
    height += carto.height
    count += 1
  })
  if (count === 0) return points[0] as Cesium.Cartesian3
  return Cesium.Cartesian3.fromRadians(lon / count, lat / count, height / count)
}

export function measureHeight(a: PositionInput, b: PositionInput): number {
  const from = Cesium.Cartographic.fromCartesian(resolvePosition(a))
  const to = Cesium.Cartographic.fromCartesian(resolvePosition(b))
  return (to?.height ?? 0) - (from?.height ?? 0)
}

export function measureCircle(
  center: PositionInput,
  edge: PositionInput
): CircleMeasurement {
  const radius = geodesicDistance(resolvePosition(center), resolvePosition(edge))
  const ratio = Math.min(Math.PI, radius / MEAN_RADIUS)
  return {
    radius,
    area: 2 * Math.PI * MEAN_RADIUS * MEAN_RADIUS * (1 - Math.cos(ratio)),
    circumference: 2 * Math.PI * MEAN_RADIUS * Math.sin(ratio)
  }
}

export function getRectangleCorners(
  a: PositionInput,
  b: PositionInput
): Cesium.Cartesian3[] {
  const from = Cesium.Cartographic.fromCartesian(resolvePosition(a))
  const to = Cesium.Cartographic.fromCartesian(resolvePosition(b))
  const lonA = Cesium.Math.toDegrees(from?.longitude ?? 0)
  const latA = Cesium.Math.toDegrees(from?.latitude ?? 0)
  const lonB = Cesium.Math.toDegrees(to?.longitude ?? 0)
  const latB = Cesium.Math.toDegrees(to?.latitude ?? 0)
  const height = ((from?.height ?? 0) + (to?.height ?? 0)) / 2
  const west = Math.min(lonA, lonB)
  const east = Math.max(lonA, lonB)
  const south = Math.min(latA, latB)
  const north = Math.max(latA, latB)
  return [
    Cesium.Cartesian3.fromDegrees(west, south, height),
    Cesium.Cartesian3.fromDegrees(east, south, height),
    Cesium.Cartesian3.fromDegrees(east, north, height),
    Cesium.Cartesian3.fromDegrees(west, north, height)
  ]
}

export function measureRectangle(
  a: PositionInput,
  b: PositionInput
): RectangleMeasurement {
  const corners = getRectangleCorners(a, b)
  const area = measureArea(corners)
  return {
    area: area.area,
    perimeter: area.perimeter,
    width: geodesicDistance(corners[0] as Cesium.Cartesian3, corners[1] as Cesium.Cartesian3),
    height: geodesicDistance(corners[1] as Cesium.Cartesian3, corners[2] as Cesium.Cartesian3)
  }
}

function formatNumber(value: number, decimals: number): string {
  const fixed = value.toFixed(decimals)
  if (!fixed.includes('.')) return fixed
  return fixed.replace(/\.?0+$/, '')
}

export function formatDistance(meters: number, decimals = 2): string {
  if (!Number.isFinite(meters)) return '-'
  if (Math.abs(meters) >= 1000) {
    return `${formatNumber(meters / 1000, decimals)} km`
  }
  return `${formatNumber(meters, decimals)} m`
}

export function formatArea(squareMeters: number, decimals = 2): string {
  if (!Number.isFinite(squareMeters)) return '-'
  if (Math.abs(squareMeters) >= 1_000_000) {
    return `${formatNumber(squareMeters / 1_000_000, decimals)} km²`
  }
  return `${formatNumber(squareMeters, decimals)} m²`
}

export function formatHeight(meters: number, decimals = 2): string {
  if (!Number.isFinite(meters)) return '-'
  const sign = meters > 0 ? '+' : ''
  return `${sign}${formatNumber(meters, decimals)} m`
}

export function summarizeMeasurement(
  type: import('./types').DrawType,
  controlPoints: Cesium.Cartesian3[]
): MeasurementSummary {
  if (controlPoints.length === 0) return {}

  if (type === 'point') return {}

  if (type === 'circle' && controlPoints.length >= 2) {
    const circle = measureCircle(
      controlPoints[0] as Cesium.Cartesian3,
      controlPoints[1] as Cesium.Cartesian3
    )
    return {
      radius: circle.radius,
      area: circle.area,
      perimeter: circle.circumference
    }
  }

  if (type === 'rectangle' && controlPoints.length >= 2) {
    const rectangle = measureRectangle(
      controlPoints[0] as Cesium.Cartesian3,
      controlPoints[1] as Cesium.Cartesian3
    )
    return {
      area: rectangle.area,
      perimeter: rectangle.perimeter,
      width: rectangle.width,
      height: rectangle.height
    }
  }

  if (type === 'polygon') {
    const area = measureArea(controlPoints)
    return { area: area.area, perimeter: area.perimeter }
  }

  const distance = measureDistance(controlPoints)
  return {
    distance: distance.distance,
    heightDiff: distance.heightDiff
  }
}
