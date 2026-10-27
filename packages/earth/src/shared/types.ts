export type EarthMode = 'atmosphere' | 'ocean' | 'chemistry' | 'particulate' | 'space' | 'biology'

export type EarthProjection = '3D' | '2D' | 'COLUMBUS_VIEW'

export type EarthInterpolation = 'bilinear' | 'nearest'

export interface EarthBounds {
  west: number
  south: number
  east: number
  north: number
}

export interface EarthTimeRange {
  start: Date
  end: Date
}

export interface EarthScalarFrame {
  time: Date
  bounds: EarthBounds
  width: number
  height: number
  values: Float32Array | number[]
  noData?: number
}

export interface EarthLegend {
  min: number
  max: number
  unit: string
  colors: string[]
}

export interface EarthScalarData {
  frames: EarthScalarFrame[]
  legend: EarthLegend
}

export interface EarthVectorConfig {
  id: string
  label: string
  unit: string
  data: string
  colors?: string[]
  particleHeight?: number
  speedFactor?: number
}

export interface EarthOverlayConfig extends EarthLegend {
  id: string
  label: string
  data: string
  scale?: 'linear' | 'log'
}

export interface EarthModeConfig {
  id: EarthMode
  label: string
  vectors: EarthVectorConfig[]
  overlays: EarthOverlayConfig[]
  defaultVector?: string
  defaultOverlay?: string
  defaultAnnotations?: string[]
}

export interface EarthAnnotationConfig {
  id: string
  label: string
  type: 'points' | 'polygons'
  data: string
}

export interface EarthWeatherConfig {
  points?: string
  warnings?: string
  windFarm?: string
}

export interface EarthManifest {
  name?: string
  source?: string
  range: EarthTimeRange
  bounds: EarthBounds
  modes: EarthModeConfig[]
  annotations: EarthAnnotationConfig[]
  weather?: EarthWeatherConfig
}

export interface EarthSettings {
  grid: boolean
  hd: boolean
  dynamic: boolean
  interpolation: EarthInterpolation
  infoBar: boolean
  bold: boolean
  fontScale: 'small' | 'normal' | 'large'
}

export const DEFAULT_EARTH_SETTINGS: EarthSettings = {
  grid: false,
  hd: false,
  dynamic: true,
  interpolation: 'bilinear',
  infoBar: true,
  bold: false,
  fontScale: 'normal'
}

export type EarthPolygonGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }

export interface EarthAnnotationItem {
  id: string
  label: string
  type: 'point' | 'polygon'
  lon?: number
  lat?: number
  geometry?: EarthPolygonGeometry
  properties?: Record<string, unknown>
}

export interface EarthProbeResult {
  lon: number
  lat: number
  vector: {
    id: string
    speed: number
    direction: number
    unit: string
  } | null
  overlay: {
    id: string
    value: number
    unit: string
    color: string
  } | null
  annotations: EarthAnnotationItem[]
}
