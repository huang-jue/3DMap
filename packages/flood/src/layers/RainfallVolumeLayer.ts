import * as Cesium from 'cesium'
import { nearestItem } from '../data/time'
import { sampleRamp, toCesiumColor } from '../shared/color'
import { RAINFALL_COLORS } from '../shared/palettes'
import type { RasterFrame } from '../shared/types'

export interface RainfallVolumeLayerOptions {
  visible?: boolean
  min?: number
  max?: number
  colors?: string[]
  sampleStep?: number
  heightScale?: number
  radius?: number
  addEntity?: (entity: Cesium.Entity) => Cesium.Entity
}

interface Bar {
  x: number
  y: number
  entity: Cesium.Entity
}

/** 降雨落区三维柱状演示：对网格抽样生成柱体，随时间更新高度与颜色。 */
export class RainfallVolumeLayer {
  private bars: Bar[] = []
  private visible: boolean
  private destroyed = false
  private readonly colors: Cesium.Color[]
  private readonly min: number
  private readonly max: number
  private readonly sampleStep: number
  private readonly heightScale: number
  private readonly radius: number
  private readonly addEntity: (entity: Cesium.Entity) => Cesium.Entity

  constructor(
    private readonly viewer: Cesium.Viewer,
    private readonly frames: RasterFrame[],
    options: RainfallVolumeLayerOptions = {}
  ) {
    this.visible = options.visible ?? false
    this.colors = (options.colors ?? RAINFALL_COLORS).map(toCesiumColor)
    this.min = options.min ?? 0
    this.max = options.max ?? 30
    this.sampleStep = Math.max(1, options.sampleStep ?? 4)
    this.heightScale = options.heightScale ?? 1800
    this.radius = options.radius ?? 6000
    this.addEntity = options.addEntity ?? ((entity) => viewer.entities.add(entity))
    const first = frames[0]
    if (!first) return
    this.buildBars(first)
    this.setTime(new Date())
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    this.bars.forEach((bar) => {
      bar.entity.show = visible
    })
    this.requestRender()
  }

  setTime(time: Date): void {
    const frame = nearestItem(this.frames, time)
    if (!frame) return
    this.bars.forEach((bar) => this.updateBar(bar, frame))
    this.requestRender()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    if (!this.viewer.isDestroyed()) {
      this.bars.forEach((bar) => this.viewer.entities.remove(bar.entity))
    }
    this.bars = []
  }

  private buildBars(frame: RasterFrame): void {
    const { width, height, bounds } = frame
    for (let y = 0; y < height; y += this.sampleStep) {
      for (let x = 0; x < width; x += this.sampleStep) {
        const lon = bounds.west + (x / Math.max(1, width - 1)) * (bounds.east - bounds.west)
        const lat = bounds.south + (y / Math.max(1, height - 1)) * (bounds.north - bounds.south)
        const entity = this.addEntity(
          new Cesium.Entity({
            id: `flood-rain-bar:${x}:${y}`,
            position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
            cylinder: {
              length: 1,
              topRadius: this.radius,
              bottomRadius: this.radius,
              material: Cesium.Color.fromCssColorString(RAINFALL_COLORS[1]!).withAlpha(0.6),
              outline: false
            },
            show: this.visible
          })
        )
        this.bars.push({ x, y, entity })
      }
    }
  }

  private updateBar(bar: Bar, frame: RasterFrame): void {
    const value = Number(frame.values[bar.y * frame.width + bar.x] ?? 0)
    const noData = frame.noData !== undefined && value === frame.noData
    if (!Number.isFinite(value) || noData || value <= 0) {
      bar.entity.show = false
      return
    }
    const height = Math.max(1, value * this.heightScale)
    const bounds = frame.bounds
    const lon = bounds.west + (bar.x / Math.max(1, frame.width - 1)) * (bounds.east - bounds.west)
    const lat =
      bounds.south + (bar.y / Math.max(1, frame.height - 1)) * (bounds.north - bounds.south)
    bar.entity.show = this.visible
    bar.entity.position = new Cesium.ConstantPositionProperty(
      Cesium.Cartesian3.fromDegrees(lon, lat, height / 2)
    )
    if (bar.entity.cylinder) {
      bar.entity.cylinder.length = new Cesium.ConstantProperty(height)
      bar.entity.cylinder.material = new Cesium.ColorMaterialProperty(
        sampleRamp(this.colors, (value - this.min) / (this.max - this.min || 1)).withAlpha(0.65)
      )
    }
  }

  private requestRender(): void {
    if (!this.viewer.isDestroyed()) this.viewer.scene.requestRender()
  }
}
