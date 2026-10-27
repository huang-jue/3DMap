import * as Cesium from 'cesium'
import { nearestItem } from '../data/time'
import { sampleRamp, toCesiumColor } from '../shared/color'
import { DEPTH_COLORS } from '../shared/palettes'
import type { FloodPolygonGeometry, FloodMultiPolygonGeometry, PolygonFrame } from '../shared/types'

export interface InundationPolygonLayerOptions {
  visible?: boolean
  minDepth?: number
  maxDepth?: number
  colors?: string[]
  alpha?: number
  onSelect?: (
    payload: {
      frame: PolygonFrame
      feature: PolygonFrame['features'][number]
    } | null
  ) => void
  addEntity?: (entity: Cesium.Entity) => Cesium.Entity
}

interface Entry {
  frame: PolygonFrame
  feature: PolygonFrame['features'][number]
  entity: Cesium.Entity
}

function polygonParts(
  geometry: FloodPolygonGeometry | FloodMultiPolygonGeometry
): FloodPolygonGeometry['coordinates'][] {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
}

/** 淹没面图层：按当前时间选择最近的 GeoJSON 面帧。 */
export class InundationPolygonLayer {
  private entries: Entry[] = []
  private entityMap = new Map<string, Entry>()
  private visible: boolean
  private currentFrame: PolygonFrame | null = null
  private destroyed = false
  private readonly colors: Cesium.Color[]
  private readonly minDepth: number
  private readonly maxDepth: number
  private readonly alpha: number
  private readonly onSelect?: InundationPolygonLayerOptions['onSelect']
  private readonly addEntity: (entity: Cesium.Entity) => Cesium.Entity

  constructor(
    private readonly viewer: Cesium.Viewer,
    private readonly frames: PolygonFrame[],
    options: InundationPolygonLayerOptions = {}
  ) {
    this.visible = options.visible ?? true
    this.colors = (options.colors ?? DEPTH_COLORS).map(toCesiumColor)
    this.minDepth = options.minDepth ?? 0
    this.maxDepth = options.maxDepth ?? 10
    this.alpha = options.alpha ?? 0.55
    this.onSelect = options.onSelect
    this.addEntity = options.addEntity ?? ((entity) => viewer.entities.add(entity))
    frames.forEach((frame) => this.createFrameEntries(frame))
    this.setTime(new Date())
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    this.applyVisibility()
    this.requestRender()
  }

  setTime(time: Date): void {
    const frame = nearestItem(this.frames, time)
    if (!frame) return
    this.currentFrame = frame
    this.applyVisibility()
    this.requestRender()
  }

  handlePick(entity: Cesium.Entity | undefined): void {
    const entry = entity ? this.entityMap.get(entity.id) : undefined
    this.onSelect?.(entry ? { frame: entry.frame, feature: entry.feature } : null)
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
  }

  private createFrameEntries(frame: PolygonFrame): void {
    frame.features.forEach((feature, featureIndex) => {
      const ratio = (feature.depth - this.minDepth) / (this.maxDepth - this.minDepth || 1)
      const color = sampleRamp(this.colors, ratio)
      polygonParts(feature.geometry).forEach((polygon, partIndex) => {
        const ring = polygon[0] ?? []
        if (ring.length < 3) return
        const positions = Cesium.Cartesian3.fromDegreesArray(
          ring.flatMap((point) => [point[0] ?? 0, point[1] ?? 0])
        )
        const entity = new Cesium.Entity({
          id: `flood-inundation:${frame.time.getTime()}:${featureIndex}:${partIndex}`,
          name: feature.name ?? `淹没面 ${featureIndex + 1}`,
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(positions),
            height: 0,
            material: color.withAlpha(this.alpha),
            outline: true,
            outlineColor: color,
            outlineWidth: 1
          }
        })
        const added = this.addEntity(entity)
        const entry: Entry = { frame, feature, entity: added }
        this.entries.push(entry)
        this.entityMap.set(added.id, entry)
      })
    })
  }

  private applyVisibility(): void {
    this.entries.forEach((entry) => {
      entry.entity.show = this.visible && entry.frame === this.currentFrame
    })
  }

  private requestRender(): void {
    if (!this.viewer.isDestroyed()) this.viewer.scene.requestRender()
  }
}
