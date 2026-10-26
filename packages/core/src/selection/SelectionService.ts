import * as Cesium from 'cesium'
import type { CesiumViewerManager } from '../viewer/CesiumViewerManager'
import type { PickEventPayload } from '../pick/PickService'

export interface SelectionResult {
  kind: 'entity' | 'tiles-feature'
  id?: string | number
  layerId?: string
  properties: Record<string, unknown>
  entity?: Cesium.Entity
  feature?: Cesium.Cesium3DTileFeature
}

export interface SelectionState {
  selected: SelectionResult | null
  hovered: SelectionResult | null
}

interface Highlight {
  result: SelectionResult
  restore(): void
}

/** Single selection, with separate hover state. Entity highlighting uses disposable overlays. */
export class SelectionService {
  private selected: Highlight | null = null
  private hovered: Highlight | null = null
  private enabled = true
  private destroyed = false
  private listeners = new Set<(state: SelectionState) => void>()
  private disposers: Array<() => void> = []
  private readonly selectedColor = Cesium.Color.YELLOW
  private readonly hoverColor = Cesium.Color.CYAN

  constructor(private readonly manager: CesiumViewerManager) {
    this.disposers.push(
      manager.pick.on('click', (payload) => {
        this.select(payload)
      }),
      manager.pick.on('hover', (payload) => {
        this.hover(payload)
      }),
      manager.pick.onMiss((type) => {
        if (type === 'click') this.select(null)
        else this.hover(null)
      }),
      manager.events.on('draw:start', () => this.clear()),
      manager.events.on('layer:change', () => this.prune()),
      manager.events.on('resource:change', ({ source, id, action }) => {
        let changed = false
        for (const slot of ['selected', 'hovered'] as const) {
          const target = this[slot]
          if (
            target?.result.kind === 'tiles-feature' &&
            source === 'tileset' &&
            manager.tilesets.get(id) === target.result.feature?.tileset &&
            action === 'style'
          ) {
            target.restore()
            this[slot] = null
            changed = true
          }
        }
        this.prune()
        if (changed) this.emit()
      })
    )
    this.disposers.push(
      manager.viewer.scene.preRender.addEventListener(() => {
        if (!this.manager.pick.isEnabled()) this.clear()
        else this.prune()
      })
    )
  }

  get state(): SelectionState {
    return { selected: this.selected?.result ?? null, hovered: this.hovered?.result ?? null }
  }

  onChange(handler: (state: SelectionState) => void): () => void {
    this.listeners.add(handler)
    return () => this.listeners.delete(handler)
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) this.clear()
  }

  select(payload: PickEventPayload | null): SelectionResult | null {
    if (this.destroyed || !this.enabled || !this.manager.pick.isEnabled()) return null
    this.hovered?.restore()
    this.hovered = null
    this.selected?.restore()
    const result = this.describe(payload)
    this.selected = result ? this.highlight(result, this.selectedColor) : null
    this.emit()
    return result
  }

  hover(payload: PickEventPayload | null): void {
    if (this.destroyed || !this.enabled || !this.manager.pick.isEnabled()) return
    const result = this.describe(payload)
    if (this.same(this.hovered?.result, result)) return
    this.hovered?.restore()
    this.hovered =
      result && !this.same(this.selected?.result, result)
        ? this.highlight(result, this.hoverColor)
        : null
    this.emit()
  }

  clear(): void {
    const changed = Boolean(this.selected || this.hovered)
    this.hovered?.restore()
    this.selected?.restore()
    this.hovered = this.selected = null
    if (changed) this.emit()
  }

  destroy(): void {
    if (this.destroyed) return
    this.clear()
    this.destroyed = true
    this.disposers.forEach((dispose) => dispose())
    this.listeners.clear()
  }

  private describe(payload: PickEventPayload | null): SelectionResult | null {
    if (!payload) return null
    const entity = payload.entity
    if (entity) {
      if (entity.id.startsWith('cesium-kit-highlight-')) return null
      const layerId = this.entityLayer(entity)
      return {
        kind: 'entity',
        id: entity.id,
        layerId,
        properties: {
          name: entity.name,
          ...entity.properties?.getValue(this.manager.clock.raw.currentTime)
        },
        entity
      }
    }
    const feature =
      payload.feature ??
      (payload.picked instanceof Cesium.Cesium3DTileFeature ? payload.picked : undefined)
    if (!feature) return null
    const properties: Record<string, unknown> = {}
    for (const key of feature.getPropertyIds()) properties[key] = feature.getProperty(key)
    const stableId = properties.id ?? properties.ID ?? properties.globalId
    const sourceId = this.manager.tilesets
      .list()
      .find((item) => this.manager.tilesets.get(item.name) === feature.tileset)?.name
    const layerId = this.findLayer('tileset', sourceId)
    return {
      kind: 'tiles-feature',
      id: typeof stableId === 'string' || typeof stableId === 'number' ? stableId : undefined,
      layerId,
      properties,
      feature
    }
  }

  private highlight(result: SelectionResult, color: Cesium.Color): Highlight {
    const viewer = this.manager.viewer
    if (result.feature) {
      const feature = result.feature
      const previous = Cesium.Color.clone(feature.color)
      feature.color = color
      return {
        result,
        restore: () => {
          if (!feature.tileset.isDestroyed() && Cesium.Color.equals(feature.color, color))
            feature.color = previous
        }
      }
    }
    const source = result.entity!
    const overlay = new Cesium.Entity({
      id: `cesium-kit-highlight-${Cesium.createGuid()}`,
      position: source.position,
      orientation: source.orientation,
      availability: source.availability
    })
    if (source.point) {
      overlay.point = source.point.clone()
      overlay.point.color = new Cesium.ConstantProperty(color)
      overlay.point.pixelSize = new Cesium.ConstantProperty(
        (source.point.pixelSize?.getValue(this.manager.clock.raw.currentTime) ?? 8) + 3
      )
    }
    if (source.billboard) {
      overlay.billboard = source.billboard.clone()
      overlay.billboard.color = new Cesium.ConstantProperty(color)
    }
    if (source.label) {
      overlay.label = source.label.clone()
      overlay.label.fillColor = new Cesium.ConstantProperty(color)
    }
    if (source.polyline) {
      overlay.polyline = source.polyline.clone()
      overlay.polyline.material = new Cesium.ColorMaterialProperty(color)
    }
    if (source.polygon) {
      overlay.polygon = source.polygon.clone()
      overlay.polygon.material = new Cesium.ColorMaterialProperty(color.withAlpha(0.5))
    }
    if (source.ellipse) {
      overlay.ellipse = source.ellipse.clone()
      overlay.ellipse.material = new Cesium.ColorMaterialProperty(color.withAlpha(0.5))
    }
    if (source.model) {
      overlay.model = source.model.clone()
      overlay.model.silhouetteColor = new Cesium.ConstantProperty(color)
      overlay.model.silhouetteSize = new Cesium.ConstantProperty(3)
    }
    viewer.entities.add(overlay)
    return {
      result,
      restore: () => {
        if (!viewer.isDestroyed()) viewer.entities.remove(overlay)
      }
    }
  }

  private entityLayer(entity: Cesium.Entity): string | undefined {
    for (const item of this.manager.dataSources.list()) {
      if (this.manager.dataSources.get(item.name)?.entities.contains(entity))
        return this.findLayer('datasource', item.name)
    }
    const walk = (
      nodes: ReturnType<CesiumViewerManager['layerManager']['tree']>
    ): string | undefined => {
      for (const node of nodes) {
        if (
          node.kind === 'entities' &&
          this.manager.layerManager.getEntityGroup(node.id)?.dataSource.entities.contains(entity)
        )
          return node.id
        const found = walk(node.children)
        if (found) return found
      }
      return undefined
    }
    return walk(this.manager.layerManager.tree())
  }

  private findLayer(kind: string, sourceId?: string): string | undefined {
    if (!sourceId) return undefined
    const walk = (
      nodes: ReturnType<CesiumViewerManager['layerManager']['tree']>
    ): string | undefined => {
      for (const node of nodes) {
        if (node.kind === kind && node.sourceId === sourceId) return node.id
        const found = walk(node.children)
        if (found) return found
      }
      return undefined
    }
    return walk(this.manager.layerManager.tree())
  }

  private prune(): void {
    let changed = false
    for (const slot of ['selected', 'hovered'] as const) {
      const highlight = this[slot]
      if (!highlight) continue
      const { entity, feature, layerId } = highlight.result
      const layer = layerId ? this.manager.layerManager.get(layerId) : undefined
      const entityExists =
        entity &&
        (this.manager.viewer.entities.contains(entity) ||
          this.manager.dataSources
            .list()
            .some((item) => this.manager.dataSources.get(item.name)?.entities.contains(entity)) ||
          Boolean(this.entityLayer(entity)))
      const featureExists =
        feature &&
        this.manager.tilesets
          .list()
          .some((item) => this.manager.tilesets.get(item.name) === feature.tileset)
      const alive = entity
        ? entityExists && entity.isShowing
        : featureExists && !feature.tileset.isDestroyed() && feature.tileset.show
      if (!alive || (layerId && (!layer || !layer.effectiveVisible))) {
        highlight.restore()
        this[slot] = null
        changed = true
      }
    }
    if (changed) this.emit()
  }

  private same(a?: SelectionResult | null, b?: SelectionResult | null): boolean {
    return (
      a === b || Boolean(a && b && (a.entity ? a.entity === b.entity : a.feature === b.feature))
    )
  }

  private emit(): void {
    this.listeners.forEach((handler) => handler(this.state))
    if (!this.manager.viewer.isDestroyed()) this.manager.viewer.scene.requestRender()
  }
}
