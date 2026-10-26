import * as Cesium from 'cesium'
import { sampleTimeSeries } from '../data/timeSeries'
import type {
  NumericSeries,
  TurbineStatus,
  WindSample,
  WindTurbine
} from '../shared/types'

export type WindFarmLabelField = 'name' | 'power' | 'windSpeed'

export interface WindFarmLabelOptions {
  show?: boolean
  fields?: WindFarmLabelField[]
  font?: string
  color?: string
  pixelOffset?: [number, number]
}

export interface WindFarmLayerOptions {
  statusColors?: Partial<Record<TurbineStatus, string>>
  /** 点位像素大小，默认 9 */
  pointSize?: number
  label?: WindFarmLabelOptions
  selectedColor?: string
  /** 选中时点位放大倍数，默认 1.8 */
  selectedScale?: number
  statusText?: Partial<Record<TurbineStatus, string>>
  onSelect?: (turbine: WindTurbine | null) => void
  /** 实体登记函数，插件里传 ctx.layers.add */
  addEntity?: (entity: Cesium.Entity) => Cesium.Entity
  /** 可选：根据气象风场为风机提供实时风速/风向 */
  windSampler?: (lon: number, lat: number) => WindSample | null
}

interface TurbineEntry {
  turbine: WindTurbine
  entity: Cesium.Entity
  color: Cesium.Color
  pixelSize: number
}

const DEFAULT_STATUS_COLORS: Record<TurbineStatus, string> = {
  running: '#67c23a',
  stopped: '#909399',
  maintenance: '#e6a23c',
  fault: '#f56c6c'
}

const DEFAULT_STATUS_TEXT: Record<TurbineStatus, string> = {
  running: '运行',
  stopped: '停机',
  maintenance: '检修',
  fault: '故障'
}

function formatNumber(value: number, digits = 1): string {
  return value.toFixed(digits).replace(/\.0$/, '')
}

function formatPower(value: number): string {
  return value >= 1000 ? `${formatNumber(value / 1000, 2)} MW` : `${formatNumber(value, 0)} kW`
}

function resolveValue(
  series: NumericSeries | undefined,
  time: Date
): number | undefined {
  return sampleTimeSeries(series, time)
}

/**
 * 风电场图层：Billboard + Label，支持状态色、时间序列、点击选中高亮。
 */
export class WindFarmLayer {
  private entries: TurbineEntry[] = []
  private entityMap = new Map<string, TurbineEntry>()
  private turbineMap = new Map<string, TurbineEntry>()
  private selectedId: string | null = null
  private destroyed = false
  private visible = true

  private readonly statusColors: Record<TurbineStatus, string>
  private readonly statusText: Record<TurbineStatus, string>
  private readonly pointSize: number
  private readonly selectedColor: string
  private readonly selectedScale: number
  private readonly label: Required<WindFarmLabelOptions>
  private readonly onSelect?: (turbine: WindTurbine | null) => void
  private readonly addEntity: (entity: Cesium.Entity) => Cesium.Entity
  private windSampler?: (lon: number, lat: number) => WindSample | null

  constructor(
    private readonly viewer: Cesium.Viewer,
    turbines: WindTurbine[],
    options: WindFarmLayerOptions = {}
  ) {
    this.statusColors = { ...DEFAULT_STATUS_COLORS, ...options.statusColors }
    this.statusText = { ...DEFAULT_STATUS_TEXT, ...options.statusText }
    this.pointSize = options.pointSize ?? 9
    this.selectedColor = options.selectedColor ?? '#ffffff'
    this.selectedScale = options.selectedScale ?? 1.8
    this.onSelect = options.onSelect
    this.addEntity = options.addEntity ?? ((entity) => viewer.entities.add(entity))
    this.windSampler = options.windSampler
    this.label = {
      show: true,
      fields: ['name', 'power'],
      font: '13px sans-serif',
      color: '#ffffff',
      pixelOffset: [0, -14],
      ...options.label
    }

    turbines.forEach((turbine) => this.createEntry(turbine))
  }

  get size(): number {
    return this.entries.length
  }

  get selected(): WindTurbine | null {
    return this.selectedId ? (this.turbineMap.get(this.selectedId)?.turbine ?? null) : null
  }

  getTurbines(): WindTurbine[] {
    return this.entries.map((entry) => entry.turbine)
  }

  setWindSampler(sampler?: (lon: number, lat: number) => WindSample | null): void {
    this.windSampler = sampler
    this.viewer.scene.requestRender()
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    this.entries.forEach((entry) => {
      entry.entity.show = visible
    })
    this.viewer.scene.requestRender()
  }

  /** 由拾取服务调用；传入非风机实体时清空选中。 */
  handlePick(entity: Cesium.Entity | undefined): void {
    if (this.destroyed) return
    const entry = entity ? this.entityMap.get(entity.id) : undefined
    if (entry) {
      this.select(entry.turbine.id)
    } else {
      this.clearSelection()
    }
  }

  select(id: string | null): void {
    if (this.destroyed) return
    if (id === this.selectedId) return
    this.restoreSelected()
    this.selectedId = id

    const entry = id ? this.turbineMap.get(id) : undefined
    if (!entry) {
      this.onSelect?.(null)
      this.viewer.scene.requestRender()
      return
    }

    if (entry.entity.point) {
      entry.entity.point.color = new Cesium.ConstantProperty(
        Cesium.Color.fromCssColorString(this.selectedColor)
      )
      entry.entity.point.pixelSize = new Cesium.ConstantProperty(
        this.pointSize * this.selectedScale
      )
    }
    this.onSelect?.(entry.turbine)
    this.viewer.scene.requestRender()
  }

  clearSelection(): void {
    if (this.selectedId === null) return
    this.restoreSelected()
    this.selectedId = null
    this.onSelect?.(null)
    this.viewer.scene.requestRender()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    if (!this.viewer.isDestroyed()) {
      this.entries.forEach((entry) => {
        this.viewer.entities.remove(entry.entity)
      })
    }
    this.entries = []
    this.entityMap.clear()
    this.turbineMap.clear()
    this.selectedId = null
  }

  private restoreSelected(): void {
    if (!this.selectedId) return
    const previous = this.turbineMap.get(this.selectedId)
    if (!previous) return
    if (previous.entity.point) {
      previous.entity.point.color = new Cesium.ConstantProperty(previous.color)
      previous.entity.point.pixelSize = new Cesium.ConstantProperty(previous.pixelSize)
    }
  }

  private createEntry(turbine: WindTurbine): void {
    const status = turbine.status ?? 'running'
    const color = Cesium.Color.fromCssColorString(this.statusColors[status] ?? '#67c23a')
    const entity = new Cesium.Entity({
      id: `wind-farm:${turbine.id}`,
      name: turbine.name ?? turbine.id,
      position: Cesium.Cartesian3.fromDegrees(
        turbine.lon,
        turbine.lat,
        turbine.height ?? 0
      ),
      point: {
        pixelSize: this.pointSize,
        color,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      ...(this.label.show
        ? {
            label: {
              text: new Cesium.CallbackProperty(
                () => this.formatLabel(turbine),
                false
              ),
              font: this.label.font,
              fillColor: Cesium.Color.fromCssColorString(this.label.color),
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(
                this.label.pixelOffset[0],
                this.label.pixelOffset[1]
              ),
              disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
          }
        : {})
    })

    const added = this.addEntity(entity)
    const entry: TurbineEntry = {
      turbine,
      entity: added,
      color,
      pixelSize: this.pointSize
    }
    this.entries.push(entry)
    this.entityMap.set(added.id, entry)
    this.turbineMap.set(turbine.id, entry)
    if (!this.visible) added.show = false
  }

  private formatLabel(turbine: WindTurbine): string {
    const time = Cesium.JulianDate.toDate(this.viewer.clock.currentTime)
    const parts: string[] = []
    let hasWindSpeed = false

    for (const field of this.label.fields) {
      if (field === 'name') {
        if (turbine.name) parts.push(turbine.name)
      } else if (field === 'power') {
        const power = resolveValue(turbine.power, time)
        if (power !== undefined) parts.push(`功率 ${formatPower(power)}`)
      } else if (field === 'windSpeed') {
        const speed = resolveValue(turbine.windSpeed, time)
        if (speed !== undefined) {
          parts.push(`风速 ${formatNumber(speed, 1)} m/s`)
          hasWindSpeed = true
        }
      }
    }

    if (this.windSampler && !hasWindSpeed) {
      const sample = this.windSampler(turbine.lon, turbine.lat)
      if (sample) parts.push(`风速 ${formatNumber(sample.speed, 1)} m/s`)
    }

    const status = turbine.status ?? 'running'
    parts.push(this.statusText[status] ?? status)
    return parts.filter(Boolean).join(' · ')
  }
}
