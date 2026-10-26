import type { WeatherFrame, WeatherLayerData, WeatherTimeRange } from '../shared/types'

/** 把 Date/字符串转成 Date。 */
export function toDate(value: Date | string | number): Date {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`@cesium-kit/weather: 非法时间 ${String(value)}`)
  }
  return date
}

/** 返回帧集合的最小/最大时间。 */
export function framesRange(frames: WeatherFrame[]): WeatherTimeRange | null {
  if (frames.length === 0) return null
  let start = frames[0]!.time
  let end = frames[0]!.time
  frames.forEach((frame) => {
    if (frame.time.getTime() < start.getTime()) start = frame.time
    if (frame.time.getTime() > end.getTime()) end = frame.time
  })
  return { start: new Date(start), end: new Date(end) }
}

/** 多个图层时间范围的交集；任一图层无帧时返回 null。 */
export function intersectRanges(
  layers: Array<{ frames: WeatherFrame[] }>
): WeatherTimeRange | null {
  if (layers.length === 0) return null
  let start = Number.NEGATIVE_INFINITY
  let end = Number.POSITIVE_INFINITY
  for (const layer of layers) {
    const range = framesRange(layer.frames)
    if (!range) return null
    start = Math.max(start, range.start.getTime())
    end = Math.min(end, range.end.getTime())
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null
  return { start: new Date(start), end: new Date(end) }
}

/** 找时间上最接近的帧索引；无帧返回 -1。 */
export function findNearestFrameIndex(frames: WeatherFrame[], time: Date): number {
  let best = -1
  let bestDistance = Number.POSITIVE_INFINITY
  const now = time.getTime()
  frames.forEach((frame, index) => {
    const distance = Math.abs(frame.time.getTime() - now)
    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  })
  return best
}

/**
 * 在可选时间范围内找最近帧。
 * 当前时间会先钳制到范围内，再选择范围内最近的帧。
 */
export function findFrameIndexInRange(
  frames: WeatherFrame[],
  time: Date,
  range?: WeatherTimeRange
): number {
  if (!range || frames.length === 0) return findNearestFrameIndex(frames, time)
  const start = range.start.getTime()
  const end = range.end.getTime()
  const clamped = Math.min(end, Math.max(start, time.getTime()))

  let best = -1
  let bestDistance = Number.POSITIVE_INFINITY
  frames.forEach((frame, index) => {
    const timestamp = frame.time.getTime()
    if (timestamp < start || timestamp > end) return
    const distance = Math.abs(timestamp - clamped)
    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  })

  return best >= 0 ? best : findNearestFrameIndex(frames, new Date(clamped))
}

/** 找出数据集默认时间范围。 */
export function datasetRange(layers: WeatherLayerData[]): WeatherTimeRange | null {
  return intersectRanges(layers)
}

/** 约束用户选择范围到数据范围。 */
export function clampRange(
  range: WeatherTimeRange,
  available: WeatherTimeRange | null
): WeatherTimeRange {
  const start = range.start.getTime()
  const end = range.end.getTime()
  if (!available) return { start: new Date(start), end: new Date(end) }
  const min = available.start.getTime()
  const max = available.end.getTime()
  const nextStart = Math.min(max, Math.max(min, Math.min(start, end)))
  const nextEnd = Math.min(max, Math.max(min, Math.max(start, end)))
  return { start: new Date(nextStart), end: new Date(nextEnd) }
}

/** 判断时间是否在范围内。 */
export function isTimeInRange(time: Date, range: WeatherTimeRange | undefined): boolean {
  if (!range) return true
  const timestamp = time.getTime()
  return timestamp >= range.start.getTime() && timestamp <= range.end.getTime()
}
