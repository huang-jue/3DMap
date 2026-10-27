import * as Cesium from 'cesium'
import { toCesiumColor } from '../shared/color'
import type { EarthAnnotationItem, EarthPolygonGeometry } from '../shared/types'

export interface EarthAnnotationLayerOptions {
  visible?: boolean
  color?: string
  addEntity?: (entity: Cesium.Entity) => Cesium.Entity
}

function polygons(geometry: EarthPolygonGeometry): number[][][][] {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
}

/** 地球注释图层：火点、极光、珊瑚白化等。 */
export class EarthAnnotationLayer {
  private entities: Cesium.Entity[] = []
  private destroyed = false
  private readonly color: Cesium.Color
  private readonly addEntity: (entity: Cesium.Entity) => Cesium.Entity

  constructor(
    private readonly viewer: Cesium.Viewer,
    readonly items: EarthAnnotationItem[],
    options: EarthAnnotationLayerOptions = {}
  ) {
    this.color = toCesiumColor(options.color ?? '#f97316')
    this.addEntity = options.addEntity ?? ((entity) => viewer.entities.add(entity))
    items.forEach((item) => this.createItem(item))
  }

  setVisible(visible: boolean): void {
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

  private createItem(item: EarthAnnotationItem): void {
    if (item.type === 'point' && item.lon !== undefined && item.lat !== undefined) {
      const entity = this.addEntity(
        new Cesium.Entity({
          id: `earth-annotation:${item.id}`,
          name: item.label,
          position: Cesium.Cartesian3.fromDegrees(item.lon, item.lat, 0),
          point: {
            pixelSize: 7,
            color: this.color,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          },
          label: {
            text: item.label,
            font: '11px sans-serif',
            fillColor: this.color,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -10),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        })
      )
      this.entities.push(entity)
      return
    }
    if (item.geometry) {
      polygons(item.geometry).forEach((polygon, index) => {
        const ring = polygon[0] ?? []
        if (ring.length < 3) return
        const positions = Cesium.Cartesian3.fromDegreesArray(
          ring.flatMap((point) => [point[0] ?? 0, point[1] ?? 0])
        )
        const entity = this.addEntity(
          new Cesium.Entity({
            id: `earth-annotation:${item.id}:${index}`,
            name: item.label,
            polygon: {
              hierarchy: new Cesium.PolygonHierarchy(positions),
              height: 0,
              material: this.color.withAlpha(0.25),
              outline: true,
              outlineColor: this.color,
              outlineWidth: 2
            }
          })
        )
        this.entities.push(entity)
      })
    }
  }

  private requestRender(): void {
    if (!this.viewer.isDestroyed()) this.viewer.scene.requestRender()
  }
}
