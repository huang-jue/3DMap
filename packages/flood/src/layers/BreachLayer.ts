import * as Cesium from 'cesium'
import type { BreachConfig } from '../shared/types'

export interface BreachLayerOptions {
  visible?: boolean
  addEntity?: (entity: Cesium.Entity) => Cesium.Entity
}

/** 溃口点标记与基本信息。 */
export class BreachLayer {
  private entities: Cesium.Entity[] = []
  private visible: boolean
  private destroyed = false
  private readonly addEntity: (entity: Cesium.Entity) => Cesium.Entity

  constructor(
    private readonly viewer: Cesium.Viewer,
    readonly breach: BreachConfig,
    options: BreachLayerOptions = {}
  ) {
    this.visible = options.visible ?? true
    this.addEntity = options.addEntity ?? ((entity) => viewer.entities.add(entity))
    this.createEntities()
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    this.entities.forEach((entity) => {
      entity.show = visible
    })
    this.requestRender()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    if (!this.viewer.isDestroyed()) {
      this.entities.forEach((entity) => this.viewer.entities.remove(entity))
    }
    this.entities = []
  }

  private createEntities(): void {
    const color = Cesium.Color.fromCssColorString('#ef4444')
    const point = this.addEntity(
      new Cesium.Entity({
        id: 'flood-breach-point',
        name: '溃口',
        position: Cesium.Cartesian3.fromDegrees(this.breach.lon, this.breach.lat, 0),
        point: {
          pixelSize: 12,
          color,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        },
        label: {
          text: `溃口 峰值 ${Math.round(this.breach.peakFlow)} m³/s`,
          font: '12px sans-serif',
          fillColor: color,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -16),
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      })
    )
    this.entities.push(point)
    this.setVisible(this.visible)
  }

  private requestRender(): void {
    if (!this.viewer.isDestroyed()) this.viewer.scene.requestRender()
  }
}
