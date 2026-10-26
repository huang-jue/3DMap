import { legendFor, paletteFor } from '../shared/palettes'
import type {
  WeatherBounds,
  WeatherDataset,
  WeatherFrame,
  WeatherHourlyForecast,
  WeatherLayerData,
  WeatherLayerKind,
  WeatherLegend,
  WeatherPointForecast,
  WeatherPolygonGeometry,
  WeatherTimeRange,
  WeatherWarning
} from '../shared/types'

const KINDS: WeatherLayerKind[] = [
  'precip',
  'radar',
  'temperature',
  'cloud',
  'humidity',
  'pressure'
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function toDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date
  }
  return undefined
}

function requireDate(value: unknown, field: string): Date {
  const date = toDate(value)
  if (!date) throw new Error(`@cesium-kit/weather: ${field} 不是合法时间`)
  return date
}

function isKind(value: unknown): value is WeatherLayerKind {
  return typeof value === 'string' && KINDS.includes(value as WeatherLayerKind)
}

function parseBounds(value: unknown): WeatherBounds {
  if (!isRecord(value)) throw new Error('@cesium-kit/weather: frame.bounds 必须是对象')
  const west = toNumber(value.west)
  const south = toNumber(value.south)
  const east = toNumber(value.east)
  const north = toNumber(value.north)
  if (west === undefined || south === undefined || east === undefined || north === undefined) {
    throw new Error('@cesium-kit/weather: bounds 必须是 { west, south, east, north }')
  }
  return {
    west: Math.min(west, east),
    south: Math.min(south, north),
    east: Math.max(west, east),
    north: Math.max(south, north)
  }
}

function toFloat32(value: unknown): Float32Array {
  if (value instanceof Float32Array) return value
  if (Array.isArray(value)) return Float32Array.from(value as number[])
  if (ArrayBuffer.isView(value)) {
    return Float32Array.from(value as unknown as ArrayLike<number>)
  }
  if (isRecord(value) && 'array' in value) return toFloat32(value.array)
  throw new Error('@cesium-kit/weather: frame.values 必须是 number[] 或 Float32Array')
}

function parseFrame(value: unknown, index: number): WeatherFrame {
  if (!isRecord(value)) throw new Error(`@cesium-kit/weather: frames[${index}] 必须是对象`)
  const time = requireDate(value.time, `frames[${index}].time`)
  const bounds = parseBounds(value.bounds)
  const imageUrl = typeof value.imageUrl === 'string' ? value.imageUrl : undefined
  const width = toNumber(value.width)
  const height = toNumber(value.height)
  const noData = toNumber(value.noData)

  if (imageUrl) {
    return {
      time,
      bounds,
      ...(width && height ? { width, height } : {}),
      imageUrl,
      ...(noData !== undefined ? { noData } : {})
    }
  }

  if (width === undefined || height === undefined) {
    throw new Error(`@cesium-kit/weather: frames[${index}] 缺少 width/height 或 imageUrl`)
  }
  if (width <= 1 || height <= 1) {
    throw new Error(`@cesium-kit/weather: frames[${index}] 网格尺寸无效 ${width}x${height}`)
  }
  if (value.values === undefined) {
    throw new Error(`@cesium-kit/weather: frames[${index}] 缺少 values`)
  }

  const values = toFloat32(value.values)
  if (values.length !== width * height) {
    throw new Error(
      `@cesium-kit/weather: frames[${index}] values 长度不匹配，期望 ${width * height}，实际 ${values.length}`
    )
  }

  return {
    time,
    bounds,
    width,
    height,
    values,
    ...(noData !== undefined ? { noData } : {})
  }
}

function parseLegend(value: unknown, kind: WeatherLayerKind): WeatherLegend {
  const fallback = legendFor(kind)
  if (!isRecord(value)) return fallback
  const min = toNumber(value.min)
  const max = toNumber(value.max)
  const colors = Array.isArray(value.colors)
    ? value.colors.filter((color): color is string => typeof color === 'string')
    : []
  return {
    min: min ?? fallback.min,
    max: max ?? fallback.max,
    colors: colors.length > 0 ? colors : fallback.colors,
    unit:
      typeof value.unit === 'string'
        ? value.unit
        : typeof value.unit === 'undefined'
          ? fallback.unit
          : undefined
  }
}

/** 解析单个天气图层。 */
export function parseWeatherLayer(input: unknown): WeatherLayerData {
  if (!isRecord(input)) throw new Error('@cesium-kit/weather: 图层数据必须是对象')
  if (!isKind(input.kind)) {
    throw new Error(`@cesium-kit/weather: 未知图层类型 "${String(input.kind)}"`)
  }
  if (!Array.isArray(input.frames) || input.frames.length === 0) {
    throw new Error('@cesium-kit/weather: 图层必须包含至少一个 frame')
  }

  const kind = input.kind
  const palette = paletteFor(kind)
  const frames = input.frames
    .map((frame, index) => parseFrame(frame, index))
    .sort((a, b) => a.time.getTime() - b.time.getTime())

  return {
    kind,
    name: typeof input.name === 'string' ? input.name : undefined,
    unit: typeof input.unit === 'string' ? input.unit : palette.unit,
    frames,
    legend: parseLegend(input.legend, kind),
    scale: input.scale === 'log' ? 'log' : palette.scale,
    defaultVisible: typeof input.defaultVisible === 'boolean' ? input.defaultVisible : undefined,
    defaultAlpha: toNumber(input.defaultAlpha)
  }
}

function parseRange(value: unknown): WeatherTimeRange | undefined {
  if (!isRecord(value)) return undefined
  const start = toDate(value.start)
  const end = toDate(value.end)
  if (!start || !end || end.getTime() < start.getTime()) return undefined
  return { start, end }
}

function parseHourly(value: unknown): WeatherHourlyForecast {
  if (!isRecord(value)) throw new Error('@cesium-kit/weather: hourly 项必须是对象')
  const time = requireDate(value.time, 'hourly.time')
  const result: WeatherHourlyForecast = { time }
  const fields = [
    'temperature',
    'precipitation',
    'humidity',
    'windSpeed',
    'windDirection',
    'cloud'
  ] as const
  for (const field of fields) {
    const number = toNumber(value[field])
    if (number !== undefined) result[field] = number
  }
  if (typeof value.weatherCode === 'string') result.weatherCode = value.weatherCode
  if (typeof value.text === 'string') result.text = value.text
  return result
}

function parsePoint(value: unknown, index: number): WeatherPointForecast {
  if (!isRecord(value)) throw new Error(`@cesium-kit/weather: points[${index}] 必须是对象`)
  const lon = toNumber(value.lon)
  const lat = toNumber(value.lat)
  if (lon === undefined || lat === undefined) {
    throw new Error(`@cesium-kit/weather: points[${index}] 缺少 lon/lat`)
  }
  const hourly = Array.isArray(value.hourly) ? value.hourly.map(parseHourly) : []
  return {
    id: typeof value.id === 'string' ? value.id : undefined,
    name: typeof value.name === 'string' ? value.name : undefined,
    lon,
    lat,
    hourly: hourly.sort((a, b) => a.time.getTime() - b.time.getTime())
  }
}

function parseGeometry(value: unknown): WeatherPolygonGeometry {
  if (!isRecord(value)) throw new Error('@cesium-kit/weather: 预警缺少 geometry')
  if (value.type === 'Polygon' && Array.isArray(value.coordinates)) {
    return {
      type: 'Polygon',
      coordinates: value.coordinates as number[][][]
    }
  }
  if (value.type === 'MultiPolygon' && Array.isArray(value.coordinates)) {
    return {
      type: 'MultiPolygon',
      coordinates: value.coordinates as number[][][][]
    }
  }
  throw new Error('@cesium-kit/weather: 预警 geometry 仅支持 Polygon/MultiPolygon')
}

function parseWarningProperties(
  properties: Record<string, unknown>,
  geometry: WeatherPolygonGeometry,
  index: number
): WeatherWarning {
  const startTime = requireDate(properties.startTime, `warnings[${index}].startTime`)
  const endTime = requireDate(properties.endTime, `warnings[${index}].endTime`)
  return {
    id: typeof properties.id === 'string' ? properties.id : `warning-${index}`,
    type: typeof properties.type === 'string' ? properties.type : '气象预警',
    level: typeof properties.level === 'string' ? properties.level : 'yellow',
    title: typeof properties.title === 'string' ? properties.title : '气象预警',
    description: typeof properties.description === 'string' ? properties.description : undefined,
    startTime,
    endTime,
    geometry
  }
}

function parseWarnings(value: unknown): WeatherWarning[] | undefined {
  if (!isRecord(value)) return undefined
  if (value.type === 'FeatureCollection' && Array.isArray(value.features)) {
    return value.features.map((feature, index) => {
      if (!isRecord(feature) || !isRecord(feature.properties)) {
        throw new Error(`@cesium-kit/weather: warnings.features[${index}] 格式错误`)
      }
      return parseWarningProperties(feature.properties, parseGeometry(feature.geometry), index)
    })
  }
  throw new Error('@cesium-kit/weather: warnings 必须是 GeoJSON FeatureCollection')
}

/** 解析城市/点预报数组。 */
export function parseWeatherPoints(input: unknown): WeatherPointForecast[] {
  const payload = Array.isArray(input)
    ? input
    : isRecord(input) && Array.isArray(input.points)
      ? input.points
      : undefined
  if (!payload) {
    throw new Error('@cesium-kit/weather: 点预报数据必须是数组或 { points: [] }')
  }
  return payload.map(parsePoint)
}

/** 解析气象预警 GeoJSON。 */
export function parseWeatherWarnings(input: unknown): WeatherWarning[] {
  const warnings = parseWarnings(input)
  if (!warnings) {
    throw new Error('@cesium-kit/weather: 预警数据必须是 GeoJSON FeatureCollection')
  }
  return warnings
}

/** 解析完整数据集。也接受单个图层对象。 */
export function parseWeatherDataset(input: unknown): WeatherDataset {
  if (!isRecord(input)) throw new Error('@cesium-kit/weather: 数据必须是对象')

  if (Array.isArray(input.layers)) {
    const layers = input.layers.map(parseWeatherLayer)
    const points = Array.isArray(input.points) ? input.points.map(parsePoint) : undefined
    const warnings = parseWarnings(input.warnings)
    return {
      name: typeof input.name === 'string' ? input.name : undefined,
      range: parseRange(input.range),
      layers,
      ...(points ? { points } : {}),
      ...(warnings ? { warnings } : {})
    }
  }

  if ('frames' in input) {
    return { layers: [parseWeatherLayer(input)] }
  }

  throw new Error('@cesium-kit/weather: 无法识别的数据格式，需要图层或 { layers: [] }')
}

/** 兼容单图层入口的别名。 */
export function parseWeatherJson(input: unknown): WeatherDataset {
  return parseWeatherDataset(input)
}
