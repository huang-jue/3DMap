import type {
  BreachConfig,
  DispatchPlan,
  DispatchProject,
  FloodBounds,
  FloodDataset,
  FloodLineGeometry,
  FloodMultiLineGeometry,
  FloodMultiPolygonGeometry,
  FloodPolygonGeometry,
  FloodWarning,
  FloodWarningLevel,
  FloodWarningType,
  ForecastNode,
  ForecastPoint,
  ForecastWarningLevel,
  HydrologyStation,
  HydrologyStationType,
  KnowledgeEntry,
  PlanSection,
  PlanTemplate,
  PolygonFrame,
  RasterFrame,
  RehearsalScenario,
  RehearsalType,
  River,
  StationReading,
  WaterProject,
  WaterProjectType
} from '../shared/types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function optionalNum(value: unknown): number | undefined {
  const parsed = num(value, Number.NaN)
  return Number.isFinite(parsed) ? parsed : undefined
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function date(value: unknown, fallback?: Date): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  if (fallback) return fallback
  throw new Error('@sgyx/cesium-kit-flood: 数据中包含非法时间')
}

function optionalDate(value: unknown): Date | undefined {
  if (value === undefined || value === null) return undefined
  const parsed = new Date(value as string | number | Date)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function parseBounds(value: unknown): FloodBounds {
  if (!isRecord(value)) throw new Error('@sgyx/cesium-kit-flood: bounds 必须是对象')
  return {
    west: num(value.west),
    south: num(value.south),
    east: num(value.east),
    north: num(value.north)
  }
}

function parseLine(value: unknown): FloodLineGeometry | FloodMultiLineGeometry {
  if (!isRecord(value)) throw new Error('@sgyx/cesium-kit-flood: 河流 geometry 必须是对象')
  if (value.type === 'LineString' && Array.isArray(value.coordinates)) {
    return {
      type: 'LineString',
      coordinates: value.coordinates as Array<[number, number]>
    }
  }
  if (value.type === 'MultiLineString' && Array.isArray(value.coordinates)) {
    return {
      type: 'MultiLineString',
      coordinates: value.coordinates as Array<Array<[number, number]>>
    }
  }
  throw new Error('@sgyx/cesium-kit-flood: 河流仅支持 LineString/MultiLineString')
}

function parsePolygon(value: unknown): FloodPolygonGeometry | FloodMultiPolygonGeometry {
  if (!isRecord(value)) throw new Error('@sgyx/cesium-kit-flood: 预警 geometry 必须是对象')
  if (value.type === 'Polygon' && Array.isArray(value.coordinates)) {
    return {
      type: 'Polygon',
      coordinates: value.coordinates as Array<Array<[number, number]>>
    }
  }
  if (value.type === 'MultiPolygon' && Array.isArray(value.coordinates)) {
    return {
      type: 'MultiPolygon',
      coordinates: value.coordinates as Array<Array<Array<[number, number]>>>
    }
  }
  throw new Error('@sgyx/cesium-kit-flood: 仅支持 Polygon/MultiPolygon')
}

function parseRiver(value: unknown): River {
  if (!isRecord(value)) throw new Error('@sgyx/cesium-kit-flood: 河流项必须是对象')
  return {
    id: str(value.id),
    name: str(value.name, str(value.id)),
    level: num(value.level, 1) as 1 | 2 | 3,
    geometry: parseLine(value.geometry)
  }
}

function parseProject(value: unknown): WaterProject {
  if (!isRecord(value)) throw new Error('@sgyx/cesium-kit-flood: 工程项必须是对象')
  return {
    id: str(value.id),
    name: str(value.name, str(value.id)),
    type: str(value.type, 'reservoir') as WaterProjectType,
    lon: num(value.lon),
    lat: num(value.lat),
    capacity: optionalNum(value.capacity),
    status: typeof value.status === 'string' ? value.status : undefined,
    properties: isRecord(value.properties) ? value.properties : undefined
  }
}

function parseReading(value: unknown): StationReading {
  if (!isRecord(value)) throw new Error('@sgyx/cesium-kit-flood: 监测读数必须是对象')
  return {
    time: date(value.time),
    value: num(value.value),
    unit: typeof value.unit === 'string' ? value.unit : undefined
  }
}

function parseStation(value: unknown): HydrologyStation {
  if (!isRecord(value)) throw new Error('@sgyx/cesium-kit-flood: 站点项必须是对象')
  return {
    id: str(value.id),
    name: str(value.name, str(value.id)),
    type: str(value.type, 'waterLevel') as HydrologyStationType,
    lon: num(value.lon),
    lat: num(value.lat),
    unit: typeof value.unit === 'string' ? value.unit : undefined,
    readings: Array.isArray(value.readings)
      ? value.readings.map(parseReading).sort((a, b) => a.time.getTime() - b.time.getTime())
      : undefined
  }
}

function parseForecastPoint(value: unknown): ForecastPoint {
  if (!isRecord(value)) throw new Error('@sgyx/cesium-kit-flood: 预报点必须是对象')
  return {
    time: date(value.time),
    value: num(value.value),
    forecast: value.forecast === true
  }
}

function parseForecastNode(value: unknown): ForecastNode {
  if (!isRecord(value)) throw new Error('@sgyx/cesium-kit-flood: 预报节点必须是对象')
  return {
    id: str(value.id),
    name: str(value.name, str(value.id)),
    lon: num(value.lon),
    lat: num(value.lat),
    warningLevel: str(value.warningLevel, 'normal') as ForecastWarningLevel,
    unit: typeof value.unit === 'string' ? value.unit : undefined,
    series: Array.isArray(value.series)
      ? value.series.map(parseForecastPoint).sort((a, b) => a.time.getTime() - b.time.getTime())
      : []
  }
}

function parseRasterFrame(value: unknown): RasterFrame {
  if (!isRecord(value)) throw new Error('@sgyx/cesium-kit-flood: 栅格帧必须是对象')
  const width = num(value.width)
  const height = num(value.height)
  if (!Array.isArray(value.values) && !ArrayBuffer.isView(value.values)) {
    throw new Error('@sgyx/cesium-kit-flood: 栅格帧缺少 values')
  }
  const values = Array.isArray(value.values)
    ? (value.values as number[])
    : Float32Array.from(value.values as unknown as ArrayLike<number>)
  if (values.length !== width * height) {
    throw new Error('@sgyx/cesium-kit-flood: 栅格帧 values 长度不匹配')
  }
  return {
    time: date(value.time),
    bounds: parseBounds(value.bounds),
    width,
    height,
    values,
    noData: optionalNum(value.noData)
  }
}

function parsePolygonFrame(value: unknown): PolygonFrame {
  if (!isRecord(value)) throw new Error('@sgyx/cesium-kit-flood: 淹没面帧必须是对象')
  const features = Array.isArray(value.features) ? value.features : []
  return {
    time: date(value.time),
    features: features.map((item, index) => {
      if (!isRecord(item)) throw new Error('@sgyx/cesium-kit-flood: 淹没面要素格式错误')
      const properties = isRecord(item.properties) ? item.properties : {}
      return {
        id: typeof item.id === 'string' ? item.id : `polygon-${index}`,
        name: typeof properties.name === 'string' ? properties.name : undefined,
        depth: num(properties.depth ?? item.depth),
        geometry: parsePolygon(item.geometry)
      }
    })
  }
}

function parseWarning(value: unknown): FloodWarning {
  if (!isRecord(value)) throw new Error('@sgyx/cesium-kit-flood: 预警项必须是对象')
  return {
    id: str(value.id),
    type: str(value.type, 'river-risk') as FloodWarningType,
    level: str(value.level, 'yellow') as FloodWarningLevel,
    title: str(value.title, str(value.id)),
    description: typeof value.description === 'string' ? value.description : undefined,
    lon: optionalNum(value.lon),
    lat: optionalNum(value.lat),
    geometry: value.geometry ? parsePolygon(value.geometry) : undefined,
    population: optionalNum(value.population),
    startTime: optionalDate(value.startTime),
    endTime: optionalDate(value.endTime)
  }
}

function parseBreach(value: unknown): BreachConfig {
  if (!isRecord(value)) throw new Error('@sgyx/cesium-kit-flood: 溃口配置必须是对象')
  return {
    lon: num(value.lon),
    lat: num(value.lat),
    width: num(value.width),
    peakFlow: num(value.peakFlow),
    hydrograph: Array.isArray(value.hydrograph)
      ? value.hydrograph.map((item) => {
          const record = isRecord(item) ? item : {}
          return { time: date(record.time), flow: num(record.flow) }
        })
      : []
  }
}

function parseDispatchProject(value: unknown): DispatchProject {
  if (!isRecord(value)) throw new Error('@sgyx/cesium-kit-flood: 调度工程必须是对象')
  return {
    id: str(value.id),
    name: str(value.name, str(value.id)),
    lon: num(value.lon),
    lat: num(value.lat),
    inflow: num(value.inflow),
    outflow: num(value.outflow),
    level: num(value.level),
    series: Array.isArray(value.series)
      ? value.series.map((item) => {
          const record = isRecord(item) ? item : {}
          return {
            time: date(record.time),
            inflow: num(record.inflow),
            outflow: num(record.outflow),
            level: num(record.level)
          }
        })
      : undefined
  }
}

function parseDispatch(value: unknown): DispatchPlan {
  if (!isRecord(value)) throw new Error('@sgyx/cesium-kit-flood: 调度方案必须是对象')
  return {
    name: str(value.name, '联合调度方案'),
    steps: Array.isArray(value.steps)
      ? value.steps.filter((item): item is string => typeof item === 'string')
      : [],
    projects: Array.isArray(value.projects) ? value.projects.map(parseDispatchProject) : []
  }
}

function parseRehearsal(value: unknown): RehearsalScenario {
  if (!isRecord(value)) throw new Error('@sgyx/cesium-kit-flood: 预演场景必须是对象')
  const startTime = date(value.startTime)
  const endTime = date(value.endTime, startTime)
  return {
    id: str(value.id),
    name: str(value.name, str(value.id)),
    type: str(value.type, 'flood') as RehearsalType,
    startTime,
    endTime,
    rasterFrames: Array.isArray(value.rasterFrames)
      ? value.rasterFrames.map(parseRasterFrame).sort((a, b) => a.time.getTime() - b.time.getTime())
      : undefined,
    polygonFrames: Array.isArray(value.polygonFrames)
      ? value.polygonFrames
          .map(parsePolygonFrame)
          .sort((a, b) => a.time.getTime() - b.time.getTime())
      : undefined,
    breach: value.breach ? parseBreach(value.breach) : undefined,
    dispatch: value.dispatch ? parseDispatch(value.dispatch) : undefined
  }
}

function parseKnowledge(value: unknown): KnowledgeEntry {
  if (!isRecord(value)) throw new Error('@sgyx/cesium-kit-flood: 知识条目必须是对象')
  return {
    id: str(value.id),
    title: str(value.title, str(value.id)),
    tags: Array.isArray(value.tags)
      ? value.tags.filter((item): item is string => typeof item === 'string')
      : [],
    riskTypes: Array.isArray(value.riskTypes)
      ? value.riskTypes.filter((item): item is string => typeof item === 'string')
      : [],
    content: str(value.content)
  }
}

function parseSection(value: unknown): PlanSection {
  if (!isRecord(value)) throw new Error('@sgyx/cesium-kit-flood: 预案章节必须是对象')
  return {
    title: str(value.title),
    content: str(value.content)
  }
}

function parsePlan(value: unknown): PlanTemplate {
  if (!isRecord(value)) throw new Error('@sgyx/cesium-kit-flood: 预案模板必须是对象')
  return {
    id: str(value.id),
    name: str(value.name, str(value.id)),
    sections: Array.isArray(value.sections) ? value.sections.map(parseSection) : []
  }
}

export function parseFloodDataset(input: unknown): FloodDataset {
  if (!isRecord(input)) throw new Error('@sgyx/cesium-kit-flood: 数据必须是对象')
  return {
    name: typeof input.name === 'string' ? input.name : undefined,
    bounds: input.bounds ? parseBounds(input.bounds) : undefined,
    digitalMirrorUrl:
      typeof input.digitalMirrorUrl === 'string' ? input.digitalMirrorUrl : undefined,
    rainfallFrames: Array.isArray(input.rainfallFrames)
      ? input.rainfallFrames
          .map(parseRasterFrame)
          .sort((a, b) => a.time.getTime() - b.time.getTime())
      : undefined,
    rivers: Array.isArray(input.rivers) ? input.rivers.map(parseRiver) : [],
    waterProjects: Array.isArray(input.waterProjects) ? input.waterProjects.map(parseProject) : [],
    stations: Array.isArray(input.stations) ? input.stations.map(parseStation) : [],
    forecastNodes: Array.isArray(input.forecastNodes)
      ? input.forecastNodes.map(parseForecastNode)
      : [],
    warnings: Array.isArray(input.warnings) ? input.warnings.map(parseWarning) : [],
    rehearsals: Array.isArray(input.rehearsals) ? input.rehearsals.map(parseRehearsal) : [],
    knowledge: Array.isArray(input.knowledge) ? input.knowledge.map(parseKnowledge) : [],
    plans: Array.isArray(input.plans) ? input.plans.map(parsePlan) : []
  }
}
