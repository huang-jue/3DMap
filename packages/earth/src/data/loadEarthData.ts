import {
  sharedDataRepository,
  readFloatBinary,
  dataUrl,
  type FrameSource,
  type DataRequestOptions
} from '@sgyx/cesium-kit-core'
import { parseEarthManifest, parseEarthScalarData } from './parseEarthManifest'
import type {
  EarthAnnotationItem,
  EarthManifest,
  EarthPolygonGeometry,
  EarthScalarData
} from '../shared/types'

function fetchJson(url: string, options: DataRequestOptions = {}): Promise<unknown> {
  return sharedDataRepository.json(url, options)
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

export async function loadEarthManifest(
  input: EarthManifest | string,
  options: DataRequestOptions = {}
): Promise<EarthManifest> {
  if (typeof input !== 'string') return parseEarthManifest(input)
  if (input.trim().startsWith('{')) return parseEarthManifest(JSON.parse(input))
  return parseEarthManifest(await fetchJson(input, options))
}

export async function openEarthScalarSource(
  input: EarthScalarData | string,
  options: DataRequestOptions = {}
): Promise<
  FrameSource<import('../shared/types').EarthScalarFrame> & { legend: EarthScalarData['legend'] }
> {
  const payload: unknown =
    typeof input !== 'string'
      ? input
      : input.trim().startsWith('{')
        ? JSON.parse(input)
        : await fetchJson(input, options)
  if (
    isRecord(payload) &&
    payload.format === 'earth-scalar-f32-v1' &&
    Array.isArray(payload.frames)
  ) {
    const descriptors = payload.frames
      .map((frame) => {
        if (
          !isRecord(frame) ||
          typeof frame.binary !== 'string' ||
          typeof frame.width !== 'number' ||
          typeof frame.height !== 'number' ||
          !Number.isInteger(frame.width) ||
          !Number.isInteger(frame.height) ||
          frame.width <= 0 ||
          frame.height <= 0 ||
          frame.width * frame.height > 20_000_000
        )
          throw new Error('非法二进制帧描述')
        const time = new Date(String(frame.time))
        if (!Number.isFinite(time.getTime())) throw new Error('非法帧时间')
        return {
          ...frame,
          time,
          binary: dataUrl(frame.binary, String(input)),
          width: frame.width,
          height: frame.height
        }
      })
      .sort((a, b) => a.time.getTime() - b.time.getTime())
    const legend = parseEarthScalarData({ frames: [], legend: payload.legend }).legend
    return {
      legend,
      times: descriptors.map((frame) => frame.time),
      async getFrame(index, request = {}) {
        const frame = descriptors[index]
        if (!frame) throw new Error('帧索引越界')
        return sharedDataRepository.load(
          `scalar:${frame.binary}:${frame.time.toISOString()}:${frame.width}x${frame.height}:${JSON.stringify(frame)}`,
          async (signal) => {
            const values = await readFloatBinary(frame.binary, frame.width * frame.height, signal)
            return parseEarthScalarData({ legend, frames: [{ ...frame, values }] }).frames[0]!
          },
          { ...options, ...request }
        )
      }
    }
  }
  const data = parseEarthScalarData(payload)
  return {
    legend: data.legend,
    times: data.frames.map((frame) => frame.time),
    async getFrame(index, request = {}) {
      request.signal?.throwIfAborted()
      const frame = data.frames[index]
      if (!frame) throw new Error('帧索引越界')
      return frame
    }
  }
}

export async function loadEarthScalarData(
  input: EarthScalarData | string,
  options: DataRequestOptions = {}
): Promise<EarthScalarData> {
  const source = await openEarthScalarSource(input, options)
  return {
    legend: source.legend,
    frames: await Promise.all(source.times.map((_, i) => source.getFrame(i, options)))
  }
}

export async function loadEarthAnnotations(
  input: EarthAnnotationItem[] | string,
  options: DataRequestOptions = {}
): Promise<EarthAnnotationItem[]> {
  if (Array.isArray(input)) return input
  if (input.trim().startsWith('{')) return parseEarthAnnotations(JSON.parse(input))
  return parseEarthAnnotations(await fetchJson(input, options))
}
