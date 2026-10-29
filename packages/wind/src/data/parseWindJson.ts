import type { ParseWindOptions, WindBounds, WindGrid } from '../shared/types'

interface RawHeader {
  lo1?: number
  la1?: number
  lo2?: number
  la2?: number
  dx?: number
  dy?: number
  nx?: number
  ny?: number
  refTime?: string
  forecastTime?: number
  parameterNumber?: number
  parameterCategory?: number
}

interface RawGfsEntry {
  header?: RawHeader
  data?: unknown
}

interface RawGfsDocument {
  header?: RawHeader
  data?: RawGfsEntry[]
}

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

function toFloat32(value: unknown): Float32Array {
  if (value instanceof Float32Array) return value
  if (Array.isArray(value))
    return Float32Array.from(value, (item) => (item === null ? NaN : Number(item)))
  if (ArrayBuffer.isView(value)) {
    return Float32Array.from(value as unknown as ArrayLike<number>)
  }
  if (isRecord(value) && 'array' in value) return toFloat32(value.array)
  throw new Error('@cesium-kit/wind: 无法识别的风向数组，需要 Float32Array 或 number[]')
}

function normalizeLon(lon: number): number {
  let value = lon
  while (value >= 180) value -= 360
  while (value < -180) value += 360
  return value
}

function reverseRows(data: Float32Array, width: number, height: number): Float32Array {
  const result = new Float32Array(data.length)
  for (let y = 0; y < height; y += 1) {
    const source = (height - 1 - y) * width
    result.set(data.subarray(source, source + width), y * width)
  }
  return result
}

function rollColumns(
  data: Float32Array,
  width: number,
  height: number,
  offset: number
): Float32Array {
  if (offset <= 0) return data
  const result = new Float32Array(data.length)
  for (let y = 0; y < height; y += 1) {
    const base = y * width
    result.set(data.subarray(base, base + offset), base + width - offset)
    result.set(data.subarray(base + offset, base + width), base)
  }
  return result
}

function parseRefTime(header: RawHeader | undefined): Date | undefined {
  if (!header?.refTime) return undefined
  const base = new Date(header.refTime)
  if (Number.isNaN(base.getTime())) return undefined
  const forecast = toNumber(header.forecastTime)
  if (forecast === undefined) return base
  return new Date(base.getTime() + forecast * 3600_000)
}

function assertGrid(width: number, height: number, u: Float32Array, v: Float32Array): void {
  if (width <= 1 || height <= 1) {
    throw new Error(`@cesium-kit/wind: 无效的风场网格尺寸 ${width}x${height}`)
  }
  if (u.length !== width * height || v.length !== width * height) {
    throw new Error(
      `@cesium-kit/wind: 风场数组长度与网格不匹配，期望 ${width * height}，实际 u=${u.length}, v=${v.length}`
    )
  }
}

function buildBounds(west: number, south: number, east: number, north: number): WindBounds {
  return {
    west: Math.min(west, east),
    south: Math.min(south, north),
    east: Math.max(west, east),
    north: Math.max(south, north)
  }
}

function parseNative(document: Record<string, unknown>, options: ParseWindOptions): WindGrid {
  const width = toNumber(document.width)
  const height = toNumber(document.height)
  if (width === undefined || height === undefined) {
    throw new Error('@cesium-kit/wind: 原生风场数据缺少 width/height')
  }

  const u = toFloat32(document.u)
  const v = toFloat32(document.v)
  assertGrid(width, height, u, v)

  const rawBounds = document.bounds
  if (!isRecord(rawBounds)) {
    throw new Error('@cesium-kit/wind: 原生风场数据缺少 bounds')
  }

  const west = toNumber(rawBounds.west)
  const south = toNumber(rawBounds.south)
  const east = toNumber(rawBounds.east)
  const north = toNumber(rawBounds.north)
  if (west === undefined || south === undefined || east === undefined || north === undefined) {
    throw new Error('@cesium-kit/wind: bounds 必须是 { west, south, east, north }')
  }

  const shouldFlip =
    options.rowOrder === 'north' ||
    options.flipY === true ||
    (options.rowOrder === undefined && options.flipY !== false && north < south)

  const speed = document.speed === undefined ? undefined : toFloat32(document.speed)
  if (speed && speed.length !== width * height) {
    throw new Error('@cesium-kit/wind: speed 数组长度与网格不匹配')
  }
  const refTimeRaw = document.refTime
  const refTime =
    typeof refTimeRaw === 'string' || refTimeRaw instanceof Date ? new Date(refTimeRaw) : undefined

  return {
    u: shouldFlip ? reverseRows(u, width, height) : u,
    v: shouldFlip ? reverseRows(v, width, height) : v,
    ...(speed ? { speed: shouldFlip ? reverseRows(speed, width, height) : speed } : {}),
    width,
    height,
    bounds: buildBounds(west, south, east, north),
    ...(refTime && !Number.isNaN(refTime.getTime()) ? { refTime } : {})
  }
}

function findGfsEntry(entries: RawGfsEntry[], parameterNumber: number): RawGfsEntry | undefined {
  return entries.find((entry) => toNumber(entry.header?.parameterNumber) === parameterNumber)
}

function parseGfs(document: RawGfsDocument): WindGrid {
  const entries = Array.isArray(document.data) ? document.data : []
  if (entries.length < 2) {
    throw new Error('@cesium-kit/wind: GFS 数据需要至少两个 data 条目（u/v）')
  }

  const uEntry = findGfsEntry(entries, 2) ?? entries[0]
  const vEntry = findGfsEntry(entries, 3) ?? entries[1]
  if (!uEntry || !vEntry) {
    throw new Error('@cesium-kit/wind: 无法从 GFS 数据中识别 u/v 分量')
  }

  const header = uEntry.header ?? vEntry.header ?? document.header
  if (!header) throw new Error('@cesium-kit/wind: GFS 数据缺少 header')

  const width = toNumber(header.nx)
  const height = toNumber(header.ny)
  const lo1 = toNumber(header.lo1)
  const la1 = toNumber(header.la1)
  if (width === undefined || height === undefined || lo1 === undefined || la1 === undefined) {
    throw new Error('@cesium-kit/wind: GFS header 缺少 nx/ny/lo1/la1')
  }

  const dx = toNumber(header.dx) ?? 360 / width
  const dy = toNumber(header.dy)
  const la2 = toNumber(header.la2)
  if (dy === undefined && la2 === undefined) {
    throw new Error('@cesium-kit/wind: GFS header 缺少 dy/la2')
  }

  const latStep =
    la2 !== undefined
      ? (la2 - la1) / Math.max(1, height - 1)
      : la1 >= 0
        ? -Math.abs(dy ?? 1)
        : Math.abs(dy ?? 1)
  const south = Math.min(la1, la1 + latStep * (height - 1))
  const north = Math.max(la1, la1 + latStep * (height - 1))

  let u = toFloat32(uEntry.data)
  let v = toFloat32(vEntry.data)
  assertGrid(width, height, u, v)

  if (latStep < 0) {
    u = reverseRows(u, width, height)
    v = reverseRows(v, width, height)
  }

  const rawLons = Array.from({ length: width }, (_, x) => normalizeLon(lo1 + x * dx))
  let rollAt = 0
  for (let x = 1; x < rawLons.length; x += 1) {
    if ((rawLons[x] ?? 0) < (rawLons[x - 1] ?? 0)) {
      rollAt = x
      break
    }
  }
  if (rollAt > 0) {
    u = rollColumns(u, width, height, rollAt)
    v = rollColumns(v, width, height, rollAt)
  }

  const lons = rollAt > 0 ? rawLons.slice(rollAt).concat(rawLons.slice(0, rollAt)) : rawLons
  const west = lons[0] ?? lo1
  const east = lons[lons.length - 1] ?? lo1 + (width - 1) * dx
  const refTime = parseRefTime(header)

  return {
    u,
    v,
    width,
    height,
    bounds: buildBounds(west, south, east, north),
    ...(refTime ? { refTime } : {})
  }
}

/**
 * 解析风场 JSON。
 *
 * 支持两种格式：
 * 1. `{ u, v, width, height, bounds, speed?, refTime? }`
 * 2. GFS/Windy：`{ header, data: [{ header: { parameterNumber: 2 }, data: [...] }, ...] }`
 */
export function parseWindJson(input: unknown, options: ParseWindOptions = {}): WindGrid {
  if (!isRecord(input)) {
    throw new Error('@cesium-kit/wind: 风场数据必须是对象')
  }

  if ('u' in input && 'v' in input) return parseNative(input, options)
  if (Array.isArray(input.data)) return parseGfs(input as RawGfsDocument)

  throw new Error('@cesium-kit/wind: 无法识别的风场数据格式')
}

/** 解析字符串或返回已有的 WindGrid。 */
export function normalizeWindGrid(
  input: WindGrid | string,
  options: ParseWindOptions = {}
): WindGrid {
  if (typeof input !== 'string') return input
  const parsed: unknown = JSON.parse(input)
  return parseWindJson(parsed, options)
}
