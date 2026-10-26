import * as Cesium from 'cesium'
import type { WeatherPointForecast } from '../shared/types'

export interface WeatherPointLayerOptions {
  visible?: boolean
  pointSize?: number
  color?: string
  selectedColor?: string
  selectedScale?: number
  label?: boolean
  labelFont?: string
  labelColor?: string
  onSelect?: (point: WeatherPointForecast | null) => void
  addEntity?: (entity: Cesium.Entity) => Cesium.Entity
}

interface PointEntry {
  point: WeatherPointForecast
  entity: Cesium.Entity
  color: Cesium.Color
  pixelSize: number
}

const DEFAULT_COLOR = '#38bdf8'
const DEFAULT_SELECTED_COLOR = '#facc15'

/** 城市/点预报图层：Point + Label，点击选中。 */
export class WeatherPointLayer {
  private entries: PointEntry[] = []
  private entityMap = new Map<string, PointEntry>()
  private pointMap = new Map<string, PointEntry>()
  private selectedId: string | null = null
  private visible: boolean
  private destroyed = false
  private readonly pointSize: number
  private readonly color: Cesium.Color
  private readonly selectedColor: Cesium.Color
  private readonly selectedScale: number
  private readonly label: boolean
  private readonly labelFont: string
  private readonly labelColor: Cesium.Color
  private readonly onSelect?: (point: WeatherPointForecast | null) => void
  private readonly addEntity: (entity: Cesium.Entity) => Cesium.Entity

  constructor(
    private readonly viewer: Cesium.Viewer,
    points: WeatherPointForecast[],
    options: WeatherPointLayerOptions = {}
  ) {
    this.visible = options.visible ?? true
    this.pointSize = options.pointSize ?? 8
    this.color = Cesium.Color.fromCssColorString(options.color ?? DEFAULT_COLOR)
    this.selectedColor = Cesium.Color.fromCssColorString(
      options.selectedColor ?? DEFAULT_SELECTED_COLOR
    )
    this.selectedScale = options.selectedScale ?? 1.8
    this.label = options.label ?? true
    this.labelFont = options.labelFont ?? '12px sans-serif'
    this.labelColor = Cesium.Color.fromCssColorString(options.labelColor ?? '#ffffff')
    this.onSelect = options.onSelect
    this.addEntity = options.addEntity ?? ((entity) => viewer.entities.add(entity))
    points.forEach((point, index) => this.createEntry(point, index))
  }

  get size(): number {
    return this.entries.length
  }

  get selected(): WeatherPointForecast | null {
    return this.selectedId ? (this.pointMap.get(this.selectedId)?.point ?? null) : null
  }

  getPoints(): WeatherPointForecast[] {
    return this.entries.map((entry) => entry.point)
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    this.entries.forEach((entry) => {
      entry.entity.show = visible
    })
    this.requestRender()
  }

  handlePick(entity: Cesium.Entity | undefined): void {
    if (this.destroyed) return
    const entry = entity ? this.entityMap.get(entity.id) : undefined
    if (entry) this.select(this.keyOf(entry.point))
    else this.clearSelection()
  }

  select(id: string | null): void {
    if (this.destroyed) return
    if (id === this.selectedId) return
    this.restoreSelected()
    this.selectedId = id
    const entry = id ? this.pointMap.get(id) : undefined
    if (!entry) {
      this.onSelect?.(null)
      this.requestRender()
      return
    }
    if (entry.entity.point) {
      entry.entity.point.color = new Cesium.ConstantProperty(this.selectedColor)
      entry.entity.point.pixelSize = new Cesium.ConstantProperty(
        this.pointSize * this.selectedScale
      )
    }
    this.onSelect?.(entry.point)
    this.requestRender()
  }

  clearSelection(): void {
    if (this.selectedId === null) return
    this.restoreSelected()
    this.selectedId = null
    this.onSelect?.(null)
    this.requestRender()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    if (!this.viewer.isDestroyed()) {
      this.entries.forEach((entry) => this.viewer.entities.remove(entry.entity))
    }
    this.entries = []
    this.entityMap.clear()
    this.pointMap.clear()
    this.selectedId = null
  }

  private keyOf(point: WeatherPointForecast): string {
    return point.id ?? `${point.lon},${point.lat}`
  }

  private restoreSelected(): void {
    if (!this.selectedId) return
    const previous = this.pointMap.get(this.selectedId)
    if (!previous) return
    if (previous.entity.point) {
      previous.entity.point.color = new Cesium.ConstantProperty(previous.color)
      previous.entity.point.pixelSize = new Cesium.ConstantProperty(previous.pixelSize)
    }
  }

  private createEntry(point: WeatherPointForecast, index: number): void {
    const id = this.keyOf(point)
    const entity = new Cesium.Entity({
      id: `weather-point:${id || index}`,
      name: point.name ?? id,
      position: Cesium.Cartesian3.fromDegrees(point.lon, point.lat, 0),
      point: {
        pixelSize: this.pointSize,
        color: this.color,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      ...(this.label
        ? {
            label: {
              text: point.name ?? id,
              font: this.labelFont,
              fillColor: this.labelColor,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -12),
              disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
          }
        : {})
    })

    const added = this.addEntity(entity)
    const entry: PointEntry = {
      point,
      entity: added,
      color: this.color,
      pixelSize: this.pointSize
    }
    this.entries.push(entry)
    this.entityMap.set(added.id, entry)
    this.pointMap.set(id, entry)
    if (!this.visible) added.show = false
  }

  private requestRender(): void {
    if (!this.viewer.isDestroyed()) this.viewer.scene.requestRender()
  }
}
