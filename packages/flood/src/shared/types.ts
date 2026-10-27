export interface FloodBounds {
  west: number
  south: number
  east: number
  north: number
}

export type FloodPoint = [number, number]

export interface FloodLineGeometry {
  type: 'LineString'
  coordinates: FloodPoint[]
}

export interface FloodMultiLineGeometry {
  type: 'MultiLineString'
  coordinates: FloodPoint[][]
}

export interface FloodPolygonGeometry {
  type: 'Polygon'
  coordinates: FloodPoint[][]
}

export interface FloodMultiPolygonGeometry {
  type: 'MultiPolygon'
  coordinates: FloodPoint[][][]
}

export interface River {
  id: string
  name: string
  level: 1 | 2 | 3
  geometry: FloodLineGeometry | FloodMultiLineGeometry
}

export type WaterProjectType = 'reservoir' | 'dam' | 'gate' | 'pump' | 'hydropower'

export interface WaterProject {
  id: string
  name: string
  type: WaterProjectType
  lon: number
  lat: number
  capacity?: number
  status?: string
  properties?: Record<string, unknown>
}

export type HydrologyStationType = 'rainfall' | 'waterLevel' | 'flow' | 'tide'

export interface StationReading {
  time: Date
  value: number
  unit?: string
}

export interface HydrologyStation {
  id: string
  name: string
  type: HydrologyStationType
  lon: number
  lat: number
  unit?: string
  readings?: StationReading[]
}

export type ForecastWarningLevel = 'normal' | 'attention' | 'warning' | 'guarantee'

export interface ForecastPoint {
  time: Date
  value: number
  forecast: boolean
}

export interface ForecastNode {
  id: string
  name: string
  lon: number
  lat: number
  warningLevel?: ForecastWarningLevel
  unit?: string
  series: ForecastPoint[]
}

export interface RasterFrame {
  time: Date
  bounds: FloodBounds
  width: number
  height: number
  values: Float32Array | number[]
  noData?: number
}

export interface PolygonFrame {
  time: Date
  features: Array<{
    id?: string
    name?: string
    depth: number
    geometry: FloodPolygonGeometry | FloodMultiPolygonGeometry
  }>
}

export type FloodWarningType =
  'dangerous-reservoir' | 'small-reservoir' | 'mountain-flood' | 'river-risk' | 'urban-flood'

export type FloodWarningLevel = 'blue' | 'yellow' | 'orange' | 'red'

export interface FloodWarning {
  id: string
  type: FloodWarningType
  level: FloodWarningLevel
  title: string
  description?: string
  lon?: number
  lat?: number
  geometry?: FloodPolygonGeometry | FloodMultiPolygonGeometry
  population?: number
  startTime?: Date
  endTime?: Date
}

export type RehearsalType = 'flood' | 'breach' | 'dispatch'

export interface BreachConfig {
  lon: number
  lat: number
  width: number
  peakFlow: number
  hydrograph: Array<{ time: Date; flow: number }>
}

export interface DispatchProject {
  id: string
  name: string
  lon: number
  lat: number
  inflow: number
  outflow: number
  level: number
  series?: Array<{
    time: Date
    inflow: number
    outflow: number
    level: number
  }>
}

export interface DispatchPlan {
  name: string
  steps: string[]
  projects: DispatchProject[]
}

export interface RehearsalScenario {
  id: string
  name: string
  type: RehearsalType
  startTime: Date
  endTime: Date
  rasterFrames?: RasterFrame[]
  polygonFrames?: PolygonFrame[]
  breach?: BreachConfig
  dispatch?: DispatchPlan
}

export interface KnowledgeEntry {
  id: string
  title: string
  tags: string[]
  riskTypes: string[]
  content: string
}

export interface PlanSection {
  title: string
  content: string
}

export interface PlanTemplate {
  id: string
  name: string
  sections: PlanSection[]
}

export interface GeneratedPlan {
  title: string
  generatedAt: Date
  sections: PlanSection[]
  references: KnowledgeEntry[]
}

export interface FloodDataset {
  name?: string
  bounds?: FloodBounds
  digitalMirrorUrl?: string
  rainfallFrames?: RasterFrame[]
  rivers: River[]
  waterProjects: WaterProject[]
  stations: HydrologyStation[]
  forecastNodes: ForecastNode[]
  warnings: FloodWarning[]
  rehearsals: RehearsalScenario[]
  knowledge: KnowledgeEntry[]
  plans: PlanTemplate[]
}

export interface FloodLayerVisibility {
  rivers?: boolean
  waterProjects?: boolean
  stations?: boolean
  digitalMirror?: boolean
  forecast?: boolean
  rainfall?: boolean
  warnings?: boolean
  rehearsal?: boolean
  breach?: boolean
  dispatch?: boolean
}
