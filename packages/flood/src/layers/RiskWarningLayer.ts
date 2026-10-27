import * as Cesium from 'cesium'
import { toCesiumColor } from '../shared/color'
import { WARNING_LEVEL_COLORS, WARNING_TYPE_TEXT } from '../shared/palettes'
import type { FloodPolygonGeometry, FloodMultiPolygonGeometry, FloodWarning } from '../shared/types'

export interface RiskWarningLayerOptions {
  visible?: boolean
  onSelect?: (warning: FloodWarning | null) => void
  addEntity?: (entity: Cesium.Entity) => Cesium.Entity
}

interface Entry {
  warning: FloodWarning
  entities: Cesium.Entity[]
}

function rings(
  geometry: FloodPolygonGeometry | FloodMultiPolygonGeometry
): FloodPolygonGeometry['coordinates'][] {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
}

function centerOf(warning: FloodWarning): { lon: number; lat: number } {
  if (warning.lon !== undefined && warning.lat !== undefined) {
    return { lon: warning.lon, lat: warning.lat }
  }
  if (!warning.geometry) return { lon: 0, lat: 0 }
  const first = rings(warning.geometry)[0]?.[0] ?? []
  if (first.length === 0) return { lon: 0, lat: 0 }
  const total = first.reduce(
    (acc, point) => ({ lon: acc.lon + (point[0] ?? 0), lat: acc.lat + (point[1] ?? 0) }),
    { lon: 0, lat: 0 }
  )
  return { lon: total.lon / first.length, lat: total.lat / first.length }
}

export class RiskWarningLayer {
  private entries: Entry[] = []
  private entityMap = new Map<string, FloodWarning>()
  private visible: boolean
  private time: Date | null = null
  private destroyed = false
  private readonly onSelect?: (warning: FloodWarning | null) => void
  private readonly addEntity: (entity: Cesium.Entity) => Cesium.Entity

  constructor(
    private readonly viewer: Cesium.Viewer,
    warnings: FloodWarning[],
    options: RiskWarningLayerOptions = {}
  ) {
    this.visible = options.visible ?? true
    this.onSelect = options.onSelect
    this.addEntity = options.addEntity ?? ((entity) => viewer.entities.add(entity))
    warnings.forEach((warning) => this.createEntry(warning))
    this.applyTime()
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    this.applyTime()
    this.requestRender()
  }

  setTime(time: Date): void {
    this.time = time
    this.applyTime()
    this.requestRender()
  }

  handlePick(entity: Cesium.Entity | undefined): void {
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

  private createEntry(warning: FloodWarning): void {
    const color = toCesiumColor(WARNING_LEVEL_COLORS[warning.level] ?? '#eab308')
    const center = centerOf(warning)
    const entities: Cesium.Entity[] = []

    if (warning.geometry) {
      rings(warning.geometry).forEach((polygon, index) => {
        const ring = polygon[0] ?? []
        if (ring.length < 3) return
        const positions = Cesium.Cartesian3.fromDegreesArray(
          ring.flatMap((point) => [point[0] ?? 0, point[1] ?? 0])
        )
        entities.push(
          this.addEntity(
            new Cesium.Entity({
              id: `flood-warning:${warning.id}:${index}`,
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
          )
        )
      })
    }

    if (warning.lon !== undefined && warning.lat !== undefined) {
      entities.push(
        this.addEntity(
          new Cesium.Entity({
            id: `flood-warning-point:${warning.id}`,
            name: warning.title,
            position: Cesium.Cartesian3.fromDegrees(warning.lon, warning.lat, 0),
            point: {
              pixelSize: 9,
              color,
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 1,
              disableDepthTestDistance: Number.POSITIVE_INFINITY
            },
            label: {
              text: `${WARNING_TYPE_TEXT[warning.type] ?? warning.type} ${warning.title}`,
              font: '11px sans-serif',
              fillColor: color,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -12),
              disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
          })
        )
      )
    } else if (warning.geometry) {
      entities.push(
        this.addEntity(
          new Cesium.Entity({
            id: `flood-warning-label:${warning.id}`,
            position: Cesium.Cartesian3.fromDegrees(center.lon, center.lat, 0),
            label: {
              text: warning.title,
              font: '11px sans-serif',
              fillColor: color,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
          })
        )
      )
    }

    const entry: Entry = { warning, entities }
    this.entries.push(entry)
    entities.forEach((entity) => this.entityMap.set(entity.id, warning))
  }

  private applyTime(): void {
    this.entries.forEach((entry) => {
      const { startTime, endTime } = entry.warning
      const active =
        !this.time ||
        ((!startTime || this.time.getTime() >= startTime.getTime()) &&
          (!endTime || this.time.getTime() <= endTime.getTime()))
      entry.entities.forEach((entity) => {
        entity.show = this.visible && active
      })
    })
  }

  private requestRender(): void {
    if (!this.viewer.isDestroyed()) this.viewer.scene.requestRender()
  }
}
