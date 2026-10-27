import { DEFAULT_EARTH_COLORS } from '../shared/palettes'
import type {
  EarthAnnotationConfig,
  EarthBounds,
  EarthLegend,
  EarthManifest,
  EarthMode,
  EarthModeConfig,
  EarthOverlayConfig,
  EarthScalarData,
  EarthScalarFrame,
  EarthVectorConfig,
  EarthWeatherConfig
} from '../shared/types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function date(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  throw new Error('@sgyx/cesium-kit-earth: 数据中包含非法时间')
}

function parseBounds(value: unknown): EarthBounds {
  if (!isRecord(value)) throw new Error('@sgyx/cesium-kit-earth: bounds 必须是对象')
  return {
    west: num(value.west),
    south: num(value.south),
    east: num(value.east),
    north: num(value.north)
  }
}

function parseColors(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : DEFAULT_EARTH_COLORS.slice()
}

function parseLegend(value: unknown, unit: string): EarthLegend {
  const record = isRecord(value) ? value : {}
  return {
    min: num(record.min, 0),
    max: num(record.max, 1),
    unit: str(record.unit, unit),
    colors: parseColors(record.colors)
  }
}

function parseOverlay(value: unknown): EarthOverlayConfig {
  if (!isRecord(value)) throw new Error('@sgyx/cesium-kit-earth: 叠加层必须是对象')
  const unit = str(value.unit)
  return {
    id: str(value.id),
    label: str(value.label, str(value.id)),
    data: str(value.data),
    ...parseLegend(value, unit),
    max: num(value.max, 1),
    min: num(value.min, 0),
    scale: value.scale === 'log' ? 'log' : 'linear',
    metadata: isRecord(value.metadata)
      ? {
          source: str(value.metadata.source),
          resolution: num(value.metadata.resolution),
          width: num(value.metadata.width),
          height: num(value.metadata.height),
          level: str(value.metadata.level),
          times: Array.isArray(value.metadata.times)
            ? value.metadata.times.filter((time): time is string => typeof time === 'string')
            : []
        }
      : undefined
  }
}

function parseVector(value: unknown): EarthVectorConfig {
  if (!isRecord(value)) throw new Error('@sgyx/cesium-kit-earth: 矢量场必须是对象')
  return {
    id: str(value.id),
    label: str(value.label, str(value.id)),
    unit: str(value.unit),
    data: str(value.data),
    colors: Array.isArray(value.colors) ? parseColors(value.colors) : undefined,
    particleHeight: num(value.particleHeight, 50000),
    speedFactor: num(value.speedFactor, 1.5)
  }
}

function parseMode(value: unknown): EarthModeConfig {
  if (!isRecord(value)) throw new Error('@sgyx/cesium-kit-earth: 模式必须是对象')
  return {
    id: str(value.id) as EarthMode,
    label: str(value.label, str(value.id)),
    vectors: Array.isArray(value.vectors) ? value.vectors.map(parseVector) : [],
    overlays: Array.isArray(value.overlays) ? value.overlays.map(parseOverlay) : [],
    defaultVector: typeof value.defaultVector === 'string' ? value.defaultVector : undefined,
    defaultOverlay: typeof value.defaultOverlay === 'string' ? value.defaultOverlay : undefined,
    defaultAnnotations: Array.isArray(value.defaultAnnotations)
      ? value.defaultAnnotations.filter((item): item is string => typeof item === 'string')
      : undefined
  }
}

function parseAnnotation(value: unknown): EarthAnnotationConfig {
  if (!isRecord(value)) throw new Error('@sgyx/cesium-kit-earth: 注释必须是对象')
  return {
    id: str(value.id),
    label: str(value.label, str(value.id)),
    type: value.type === 'polygons' ? 'polygons' : 'points',
    data: str(value.data)
  }
}

function parseWeather(value: unknown): EarthWeatherConfig | undefined {
  if (!isRecord(value)) return undefined
  return {
    points: typeof value.points === 'string' ? value.points : undefined,
    warnings: typeof value.warnings === 'string' ? value.warnings : undefined,
    windFarm: typeof value.windFarm === 'string' ? value.windFarm : undefined,
    sample: value.sample === true,
    sampleTime: value.sampleTime === undefined ? undefined : date(value.sampleTime)
  }
}

export function parseEarthManifest(input: unknown): EarthManifest {
  if (!isRecord(input)) throw new Error('@sgyx/cesium-kit-earth: manifest 必须是对象')
  if (!isRecord(input.range)) throw new Error('@sgyx/cesium-kit-earth: manifest 缺少 range')
  const modes = Array.isArray(input.modes) ? input.modes.map(parseMode) : []
  if (modes.length === 0) throw new Error('@sgyx/cesium-kit-earth: manifest 缺少 modes')
  return {
    name: typeof input.name === 'string' ? input.name : undefined,
    source: typeof input.source === 'string' ? input.source : undefined,
    range: {
      start: date(input.range.start),
      end: date(input.range.end)
    },
    bounds: parseBounds(input.bounds),
    modes,
    annotations: Array.isArray(input.annotations) ? input.annotations.map(parseAnnotation) : [],
    weather: parseWeather(input.weather),
    metadata: isRecord(input.metadata)
      ? {
          kind: str(input.metadata.kind),
          resolution: num(input.metadata.resolution),
          width: num(input.metadata.width),
          height: num(input.metadata.height),
          level: str(input.metadata.level),
          times: Array.isArray(input.metadata.times)
            ? input.metadata.times.filter((value): value is string => typeof value === 'string')
            : [],
          provenance: str(input.metadata.provenance),
          coastline:
            typeof input.metadata.coastline === 'string' ? input.metadata.coastline : undefined
        }
      : undefined
  }
}

function parseFrame(value: unknown): EarthScalarFrame {
  if (!isRecord(value)) throw new Error('@sgyx/cesium-kit-earth: 标量帧必须是对象')
  const width = num(value.width)
  const height = num(value.height)
  if (!Array.isArray(value.values) && !ArrayBuffer.isView(value.values)) {
    throw new Error('@sgyx/cesium-kit-earth: 标量帧缺少 values')
  }
  const values = Array.isArray(value.values)
    ? (value.values as number[])
    : Float32Array.from(value.values as unknown as ArrayLike<number>)
  if (values.length !== width * height) {
    throw new Error('@sgyx/cesium-kit-earth: 标量帧 values 长度不匹配')
  }
  return {
    time: date(value.time),
    bounds: parseBounds(value.bounds),
    width,
    height,
    values,
    noData: typeof value.noData === 'number' ? value.noData : undefined
  }
}

export function parseEarthScalarData(input: unknown): EarthScalarData {
  if (!isRecord(input) || !Array.isArray(input.frames)) {
    throw new Error('@sgyx/cesium-kit-earth: 标量数据格式错误')
  }
  return {
    frames: input.frames.map(parseFrame).sort((a, b) => a.time.getTime() - b.time.getTime()),
    legend:
      isRecord(input.legend) && typeof input.legend.unit === 'string'
        ? parseLegend(input.legend, input.legend.unit)
        : parseLegend({}, '')
  }
}
