/** 天气图层类型。 */
export type WeatherLayerKind =
  | 'precip'
  | 'radar'
  | 'temperature'
  | 'cloud'
  | 'humidity'
  | 'pressure'

/** 经纬度范围，单位为度。 */
export interface WeatherBounds {
  west: number
  south: number
  east: number
  north: number
}

/** 单个预报时刻。values 与 imageUrl 二选一。 */
export interface WeatherFrame {
  time: Date
  bounds: WeatherBounds
  /** 网格宽度，values 模式下必填 */
  width?: number
  /** 网格高度，values 模式下必填 */
  height?: number
  /** 行优先网格值，第 0 行是南侧 */
  values?: Float32Array | number[]
  /** 图片帧地址，用于雷达图或后端瓦片 */
  imageUrl?: string
  /** 无数据值，渲染时透明 */
  noData?: number
}

/** 色带图例。 */
export interface WeatherLegend {
  min: number
  max: number
  colors: string[]
  unit?: string
}

export type WeatherScale = 'linear' | 'log'

/** 一个天气图层的数据。 */
export interface WeatherLayerData {
  kind: WeatherLayerKind
  name?: string
  unit?: string
  frames: WeatherFrame[]
  legend?: WeatherLegend
  scale?: WeatherScale
  defaultVisible?: boolean
  defaultAlpha?: number
}

/** 时间范围。 */
export interface WeatherTimeRange {
  start: Date
  end: Date
}

/** 小时级点预报。 */
export interface WeatherHourlyForecast {
  time: Date
  temperature?: number
  precipitation?: number
  humidity?: number
  windSpeed?: number
  windDirection?: number
  cloud?: number
  weatherCode?: string
  text?: string
}

/** 城市/任意点预报。 */
export interface WeatherPointForecast {
  id?: string
  name?: string
  lon: number
  lat: number
  hourly: WeatherHourlyForecast[]
}

export type WeatherWarningLevel = 'blue' | 'yellow' | 'orange' | 'red' | string

/** 气象预警区域。 */
export interface WeatherWarning {
  id: string
  type: string
  level: WeatherWarningLevel
  title: string
  description?: string
  startTime: Date
  endTime: Date
  geometry: WeatherPolygonGeometry
}

export type WeatherPolygonGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }

/** 完整天气数据集。 */
export interface WeatherDataset {
  name?: string
  range?: WeatherTimeRange
  layers: WeatherLayerData[]
  points?: WeatherPointForecast[]
  warnings?: WeatherWarning[]
}

/** 单点标量查询结果。 */
export interface WeatherValueSample {
  kind: WeatherLayerKind
  value: number | null
  unit?: string
  time: Date
  frame: WeatherFrame
}
