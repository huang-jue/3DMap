import * as Cesium from 'cesium'
import type { WeatherWarning, WeatherWarningLevel } from '../shared/types'

export interface WeatherWarningLayerOptions {
  visible?: boolean
  levelColors?: Partial<Record<WeatherWarningLevel, string>>
  label?: boolean
  labelFont?: string
  onSelect?: (warning: WeatherWarning | null) => void
  addEntity?: (entity: Cesium.Entity) => Cesium.Entity
}

interface WarningEntry {
  warning: WeatherWarning
  entities: Cesium.Entity[]
}

const DEFAULT_LEVEL_COLORS: Record<string, string> = {
  blue: '#3b82f6',
  yellow: '#eab308',
  orange: '#f97316',
  red: '#ef4444'
}

function outerRing(geometry: WeatherWarning['geometry']): number[][] {
  if (geometry.type === 'Polygon') {
    return geometry.coordinates[0] ?? []
  }
  return geometry.coordinates[0]?.[0] ?? []
}

export function warningCenter(warning: WeatherWarning): { lon: number; lat: number } {
  const raw = outerRing(warning.geometry)
  const first = raw[0]
  const last = raw[raw.length - 1]
  const ring =
    raw.length > 1 && first && last && first[0] === last[0] && first[1] === last[1]
      ? raw.slice(0, -1)
      : raw
  if (ring.length === 0) return { lon: 0, lat: 0 }
  const total = ring.reduce(
    (acc, point) => ({ lon: acc.lon + (point[0] ?? 0), lat: acc.lat + (point[1] ?? 0) }),
    { lon: 0, lat: 0 }
  )
  return { lon: total.lon / ring.length, lat: total.lat / ring.length }
}

/** 气象预警区域图层：GeoJSON Polygon/MultiPolygon + 标签。 */
export class WeatherWarningLayer {
  private entries: WarningEntry[] = []
  private entityMap = new Map<string, WeatherWarning>()
  private visible: boolean
  private time: Date | null = null
  private destroyed = false
  private readonly levelColors: Record<string, string>
  private readonly label: boolean
  private readonly labelFont: string
  private readonly onSelect?: (warning: WeatherWarning | null) => void
  private readonly addEntity: (entity: Cesium.Entity) => Cesium.Entity

  constructor(
    private readonly viewer: Cesium.Viewer,
    warnings: WeatherWarning[],
    options: WeatherWarningLayerOptions = {}
  ) {
    this.visible = options.visible ?? true
    const overrides = Object.fromEntries(
      Object.entries(options.levelColors ?? {}).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    )
    this.levelColors = { ...DEFAULT_LEVEL_COLORS, ...overrides }
    this.label = options.label ?? true
    this.labelFont = options.labelFont ?? '12px sans-serif'
    this.onSelect = options.onSelect
    this.addEntity = options.addEntity ?? ((entity) => viewer.entities.add(entity))
    warnings.forEach((warning) => this.createEntry(warning))
    this.applyTime()
  }

  get size(): number {
    return this.entries.length
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    this.applyTime()
    this.requestRender()
  }

  setTime(time: Date | null): void {
    this.time = time
    this.applyTime()
    this.requestRender()
  }

  handlePick(entity: Cesium.Entity | undefined): void {
    if (this.destroyed) return
    const warning = entity ? this.entityMap.get(entity.id) : undefined
    this.onSelect?.(warning ?? null)
    this.requestRender()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    if (!this.viewer.isDestroyed()) {
      this.entries.forEach((entry) => {
        entry.entities.forEach((entity) => this.viewer.entities.remove(entity))
      })
    }
    this.entries = []
    this.entityMap.clear()
  }

  private createEntry(warning: WeatherWarning): void {
    const color = Cesium.Color.fromCssColorString(
      this.levelColors[warning.level] ?? DEFAULT_LEVEL_COLORS.yellow
    )
    const geometry = warning.geometry
    const parts = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates

    const entities: Cesium.Entity[] = []
    parts.forEach((part, index) => {
      const ring = part[0] ?? []
      if (ring.length < 3) return
      const positions = Cesium.Cartesian3.fromDegreesArray(
        ring.flatMap((point) => [point[0] ?? 0, point[1] ?? 0])
      )
      const entity = new Cesium.Entity({
        id: `weather-warning:${warning.id}:${index}`,
        name: warning.title,
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(positions),
          height: 0,
          material: color.withAlpha(0.28),
          outline: true,
          outlineColor: color,
          outlineWidth: 2
        }
      })
      entities.push(this.addEntity(entity))
    })

    if (this.label && entities.length > 0) {
      const center = warningCenter(warning)
      const label = new Cesium.Entity({
        id: `weather-warning-label:${warning.id}`,
        position: Cesium.Cartesian3.fromDegrees(center.lon, center.lat, 0),
        label: {
          text: warning.title,
          font: this.labelFont,
          fillColor: color,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      })
      entities.push(this.addEntity(label))
    }

    const entry: WarningEntry = { warning, entities }
    this.entries.push(entry)
    entities.forEach((entity) => this.entityMap.set(entity.id, warning))
  }

  private applyTime(): void {
    this.entries.forEach((entry) => {
      const active = this.time
        ? this.time.getTime() >= entry.warning.startTime.getTime() &&
          this.time.getTime() <= entry.warning.endTime.getTime()
        : true
      entry.entities.forEach((entity) => {
        entity.show = this.visible && active
      })
    })
  }

  private requestRender(): void {
    if (!this.viewer.isDestroyed()) this.viewer.scene.requestRender()
  }
}
