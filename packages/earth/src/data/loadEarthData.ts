import { parseEarthManifest, parseEarthScalarData } from './parseEarthManifest'
import type {
  EarthAnnotationItem,
  EarthManifest,
  EarthPolygonGeometry,
  EarthScalarData
} from '../shared/types'

async function fetchJson(url: string): Promise<unknown> {
  if (typeof fetch !== 'function') {
    throw new Error('@sgyx/cesium-kit-earth: 当前环境没有 fetch')
  }
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `@sgyx/cesium-kit-earth: 数据请求失败 ${response.status} ${response.statusText}`
    )
  }
  return response.json()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseAnnotationFeature(value: unknown, index: number): EarthAnnotationItem | null {
  if (!isRecord(value) || !isRecord(value.geometry)) return null
  const properties = isRecord(value.properties) ? value.properties : {}
  const id =
    typeof properties.id === 'string'
      ? properties.id
      : typeof value.id === 'string'
        ? value.id
        : `annotation-${index}`
  const label =
    typeof properties.name === 'string'
      ? properties.name
      : typeof properties.title === 'string'
        ? properties.title
        : id
  const geometry = value.geometry
  if (geometry.type === 'Point' && Array.isArray(geometry.coordinates)) {
    return {
      id,
      label,
      type: 'point',
      lon: Number(geometry.coordinates[0] ?? 0),
      lat: Number(geometry.coordinates[1] ?? 0),
      properties
    }
  }
  if (
    (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') &&
    Array.isArray(geometry.coordinates)
  ) {
    return {
      id,
      label,
      type: 'polygon',
      geometry: geometry as EarthPolygonGeometry,
      properties
    }
  }
  return null
}

export function parseEarthAnnotations(input: unknown): EarthAnnotationItem[] {
  if (Array.isArray(input)) return input as EarthAnnotationItem[]
  if (!isRecord(input) || input.type !== 'FeatureCollection' || !Array.isArray(input.features)) {
    throw new Error('@sgyx/cesium-kit-earth: 注释数据必须是 GeoJSON FeatureCollection')
  }
  return input.features
    .map((feature, index) => parseAnnotationFeature(feature, index))
    .filter((item): item is EarthAnnotationItem => item !== null)
}

export async function loadEarthManifest(input: EarthManifest | string): Promise<EarthManifest> {
  if (typeof input !== 'string') return parseEarthManifest(input)
  if (input.trim().startsWith('{')) return parseEarthManifest(JSON.parse(input))
  return parseEarthManifest(await fetchJson(input))
}

export async function loadEarthScalarData(
  input: EarthScalarData | string
): Promise<EarthScalarData> {
  if (typeof input !== 'string') return parseEarthScalarData(input)
  if (input.trim().startsWith('{')) return parseEarthScalarData(JSON.parse(input))
  return parseEarthScalarData(await fetchJson(input))
}

export async function loadEarthAnnotations(
  input: EarthAnnotationItem[] | string
): Promise<EarthAnnotationItem[]> {
  if (Array.isArray(input)) return input
  if (input.trim().startsWith('{')) return parseEarthAnnotations(JSON.parse(input))
  return parseEarthAnnotations(await fetchJson(input))
}
