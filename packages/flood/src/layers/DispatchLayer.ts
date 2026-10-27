import * as Cesium from 'cesium'
import type { DispatchPlan, DispatchProject } from '../shared/types'

export interface DispatchLayerOptions {
  visible?: boolean
  onSelect?: (project: DispatchProject | null) => void
  addEntity?: (entity: Cesium.Entity) => Cesium.Entity
}

/** 联合调度工程图层。 */
export class DispatchLayer {
  private entities: Cesium.Entity[] = []
  private entityMap = new Map<string, DispatchProject>()
  private visible: boolean
  private destroyed = false
  private readonly onSelect?: (project: DispatchProject | null) => void
  private readonly addEntity: (entity: Cesium.Entity) => Cesium.Entity

  constructor(
    private readonly viewer: Cesium.Viewer,
    readonly plan: DispatchPlan,
    options: DispatchLayerOptions = {}
  ) {
    this.visible = options.visible ?? true
    this.onSelect = options.onSelect
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

  handlePick(entity: Cesium.Entity | undefined): void {
    const project = entity ? this.entityMap.get(entity.id) : undefined
    this.onSelect?.(project ?? null)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    if (!this.viewer.isDestroyed()) {
      this.entities.forEach((entity) => this.viewer.entities.remove(entity))
    }
    this.entities = []
    this.entityMap.clear()
  }

  private createEntities(): void {
    this.plan.projects.forEach((project) => {
      const entity = this.addEntity(
        new Cesium.Entity({
          id: `flood-dispatch:${project.id}`,
          name: project.name,
          position: Cesium.Cartesian3.fromDegrees(project.lon, project.lat, 0),
          point: {
            pixelSize: 10,
            color: Cesium.Color.fromCssColorString('#38bdf8'),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          },
          label: {
            text: `${project.name} 出库 ${Math.round(project.outflow)}`,
            font: '11px sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -12),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        })
      )
      this.entities.push(entity)
      this.entityMap.set(entity.id, project)
    })
    this.setVisible(this.visible)
  }

  private requestRender(): void {
    if (!this.viewer.isDestroyed()) this.viewer.scene.requestRender()
  }
}
