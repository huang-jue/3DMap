/** 经纬度范围，单位为度。 */
export interface WindBounds {
  west: number
  south: number
  east: number
  north: number
}

/**
 * 风场 U/V 网格。
 *
 * 数据按行优先存储：`index = y * width + x`，x 自西向东，y 自南向北。
 * 解析器会把 GFS/Windy 等“北到南”的数据统一翻转为“南到北”。
 */
export interface WindGrid {
  u: Float32Array | number[]
  v: Float32Array | number[]
  width: number
  height: number
  bounds: WindBounds
  /** 可选：直接给出风速场，缺省由 u/v 计算 */
  speed?: Float32Array | number[]
  /** 多时刻数据的时刻标识 */
  refTime?: Date
}

/** 插值后的风场采样值。direction 为风去向，0° 北、90° 东。 */
export interface WindSample {
  u: number
  v: number
  speed: number
  direction: number
}

export type WindGridInput = WindGrid | string

export interface ParseWindOptions {
  /**
   * 原生数据行序。默认 `'south'`，即第 0 行是南侧。
   * GFS/Windy 的 `la1 > la2` 会自动识别并翻转，不依赖此选项。
   */
  rowOrder?: 'south' | 'north'
  /** 强制指定经度范围顺序，缺省自动推断 */
  flipY?: boolean
}

export interface TimeSeriesPoint {
  time: Date | string
  value: number
}

/** 标量或时间序列。 */
export type NumericSeries = number | TimeSeriesPoint[]

export type TurbineStatus = 'running' | 'stopped' | 'maintenance' | 'fault'

export interface WindTurbine {
  id: string
  name?: string
  lon: number
  lat: number
  /** 轮毂/标签高度（米） */
  height?: number
  status?: TurbineStatus
  /** 装机容量（kW） */
  capacity?: number
  /** 有功功率（kW），可为静态值或时间序列 */
  power?: NumericSeries
  /** 风速（m/s），可为静态值或时间序列 */
  windSpeed?: NumericSeries
  /** 风向（度，风去向），可为静态值或时间序列 */
  windDirection?: NumericSeries
  /** 透传的业务字段 */
  [key: string]: unknown
}
