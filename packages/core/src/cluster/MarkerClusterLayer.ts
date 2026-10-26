import * as Cesium from 'cesium'
import { resolvePosition } from '../coords'
import { createId } from '../utils/assert'
import { toColor } from '../utils/color'
import { createLogger, type Logger } from '../utils/logger'
import type {
  MarkerClusterOptions,
  MarkerClusteringOptions,
  ClusterGraphics,
  MarkerInput
} from './types'

type ResolvedClusterOptions = Required<MarkerClusteringOptions>

const DEFAULT_CLUSTER: ResolvedClusterOptions = {
  pixelRange: 60,
  minimumClusterSize: 2,
  clusterBillboards: true,
  clusterLabels: true,
  clusterPoints: true,
  clusterEnabled: true
}

export class MarkerClusterLayer {
  readonly id: string
  readonly dataSource: Cesium.CustomDataSource
  private readonly ownsDataSource: boolean
  private readonly entityToMarker = new Map<string, MarkerInput>()
  private readonly markerToEntity = new Map<string, string>()
  private readonly log: Logger
  private clusterOptions: ResolvedClusterOptions
  private unsubscribePick: (() => void) | null = null
  private destroyed = false

  constructor(
    private readonly viewer: Cesium.Viewer,
    private readonly options: MarkerClusterOptions = {}
  ) {
    this.id = options.id ?? createId('markers')
    this.log = createLogger('cluster')
    this.ownsDataSource = !options.dataSource
    this.dataSource =
      options.dataSource ?? new Cesium.CustomDataSource(options.name ?? this.id)
    if (this.ownsDataSource) {
      this.viewer.dataSources.add(this.dataSource).catch((error) => {
        this.log.error('标注聚合数据源添加失败', error)
      })
    }
    this.clusterOptions = {
      pixelRange: options.pixelRange ?? DEFAULT_CLUSTER.pixelRange,
      minimumClusterSize:
        options.minimumClusterSize ?? DEFAULT_CLUSTER.minimumClusterSize,
      clusterBillboards: options.clusterBillboards ?? DEFAULT_CLUSTER.clusterBillboards,
      clusterLabels: options.clusterLabels ?? DEFAULT_CLUSTER.clusterLabels,
      clusterPoints: options.clusterPoints ?? DEFAULT_CLUSTER.clusterPoints,
      clusterEnabled: options.clusterEnabled ?? DEFAULT_CLUSTER.clusterEnabled
    }
    this.applyClustering()
    if (options.pick) {
      this.unsubscribePick = options.pick.on('click', (payload) => {
        this.handlePick(payload.picked ?? payload.entity)
      })
    }
  }

  get size(): number {
    return this.entityToMarker.size
  }

  get markers(): MarkerInput[] {
    return Array.from(this.entityToMarker.values())
  }

  add(marker: MarkerInput): Cesium.Entity {
    if (this.destroyed) {
      throw new Error('@cesium-kit/core: MarkerClusterLayer 已销毁')
    }
    const markerId = marker.id ?? createId('marker')
    const entityId = `${this.id}:${markerId}`
    const existing = this.dataSource.entities.getById(entityId)
    if (existing) this.remove(markerId)

    const clamp = marker.clampToGround ?? false
    const reference = clamp
      ? Cesium.HeightReference.CLAMP_TO_GROUND
      : Cesium.HeightReference.NONE
    const size = marker.size ?? 10
    const color = toColor(marker.color ?? '#409eff')
    const label = marker.label
    const entity = this.dataSource.entities.add(
      new Cesium.Entity({
        id: entityId,
        name: marker.name ?? label ?? markerId,
        position: resolvePosition(marker.position),
        properties: new Cesium.PropertyBag({
          ...(marker.data ?? {}),
          markerId
        }),
        ...(marker.icon
          ? {
              billboard: {
                image: marker.icon as string,
                width: size * 2,
                height: size * 2,
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                heightReference: reference,
                disableDepthTestDistance: Number.POSITIVE_INFINITY
              }
            }
          : {
              point: {
                pixelSize: size,
                color,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 2,
                heightReference: reference,
                disableDepthTestDistance: Number.POSITIVE_INFINITY
              }
            }),
        ...(label
          ? {
              label: {
                text: label,
                font: '13px sans-serif',
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                showBackground: true,
                backgroundColor: Cesium.Color.fromCssColorString(
                  'rgba(17, 24, 39, 0.82)'
                ),
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                pixelOffset: new Cesium.Cartesian2(0, -18),
                heightReference: reference,
                disableDepthTestDistance: Number.POSITIVE_INFINITY
              }
            }
          : {})
      })
    )
    this.entityToMarker.set(entity.id, marker)
    this.markerToEntity.set(markerId, entity.id)
    this.viewer.scene.requestRender()
    return entity
  }

  addMany(markers: MarkerInput[]): Cesium.Entity[] {
    return markers.map((marker) => this.add(marker))
  }

  remove(id: string): boolean {
    const entityId = this.markerToEntity.get(id) ?? `${this.id}:${id}`
    this.markerToEntity.delete(id)
    this.entityToMarker.delete(entityId)
    const removed = this.dataSource.entities.removeById(entityId)
    if (removed) this.viewer.scene.requestRender()
    return removed
  }

  clear(): void {
    this.dataSource.entities.removeAll()
    this.entityToMarker.clear()
    this.markerToEntity.clear()
    this.viewer.scene.requestRender()
  }

  setVisible(visible: boolean): void {
    this.dataSource.show = visible
    this.viewer.scene.requestRender()
  }

  setClustering(options: MarkerClusteringOptions | false): void {
    if (options === false) {
      this.clusterOptions = { ...this.clusterOptions, clusterEnabled: false }
    } else {
      this.clusterOptions = {
        ...this.clusterOptions,
        ...options,
        clusterEnabled: options.clusterEnabled ?? true
      }
    }
    this.applyClustering()
    this.viewer.scene.requestRender()
  }

  handlePick(picked: unknown): boolean {
    if (this.destroyed || !picked) return false
    if (picked instanceof Cesium.Entity) {
      const marker = this.entityToMarker.get(picked.id)
      if (!marker) return false
      this.options.onMarkerClick?.(marker, picked)
      return true
    }
    const raw = (picked as { id?: unknown }).id ?? picked
    if (Array.isArray(raw)) {
      const entities = raw
        .map((id) => {
          if (typeof id === 'string') return this.dataSource.entities.getById(id)
          return id instanceof Cesium.Entity ? id : undefined
        })
        .filter((entity): entity is Cesium.Entity => Boolean(entity))
      const markers = entities
        .map((entity) => this.entityToMarker.get(entity.id))
        .filter((marker): marker is MarkerInput => Boolean(marker))
      if (markers.length === 0) return false
      this.options.onClusterClick?.(markers, entities)
      if (
        this.options.defaultClusterAction === 'zoom' ||
        (!this.options.onClusterClick && this.options.defaultClusterAction !== 'none')
      ) {
        void this.viewer.flyTo(entities).catch(() => false)
      }
      return true
    }
    const entity = raw instanceof Cesium.Entity ? raw : undefined
    if (!entity) return false
    const marker = this.entityToMarker.get(entity.id)
    if (!marker) return false
    this.options.onMarkerClick?.(marker, entity)
    return true
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.unsubscribePick?.()
    this.unsubscribePick = null
    this.clear()
    if (this.ownsDataSource && !this.viewer.isDestroyed()) {
      this.viewer.dataSources.remove(this.dataSource, true)
    }
  }

  private applyClustering(): void {
    this.dataSource.clustering = new Cesium.EntityCluster({
      enabled: this.clusterOptions.clusterEnabled,
      pixelRange: this.clusterOptions.pixelRange,
      minimumClusterSize: this.clusterOptions.minimumClusterSize,
      clusterBillboards: this.clusterOptions.clusterBillboards,
      clusterLabels: this.clusterOptions.clusterLabels,
      clusterPoints: this.clusterOptions.clusterPoints
    })
    this.dataSource.clustering.clusterEvent.addEventListener(
      (entities: Cesium.Entity[], cluster: ClusterGraphics) => {
        cluster.billboard.show = false
        cluster.point.show = false
        cluster.label.show = true
        cluster.label.text =
          this.options.clusterLabel?.(entities.length) ?? String(entities.length)
        cluster.label.font = '600 13px sans-serif'
        cluster.label.fillColor = Cesium.Color.WHITE
        cluster.label.outlineColor = Cesium.Color.BLACK
        cluster.label.outlineWidth = 2
        cluster.label.style = Cesium.LabelStyle.FILL_AND_OUTLINE
        cluster.label.showBackground = true
        cluster.label.backgroundColor = toColor(
          this.options.clusterColor ?? '#2563eb'
        )
        cluster.label.backgroundPadding = new Cesium.Cartesian2(8, 4)
        cluster.label.verticalOrigin = Cesium.VerticalOrigin.CENTER
        cluster.label.horizontalOrigin = Cesium.HorizontalOrigin.CENTER
        cluster.label.disableDepthTestDistance = Number.POSITIVE_INFINITY
      }
    )
  }
}
