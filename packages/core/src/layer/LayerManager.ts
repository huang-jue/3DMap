import { cancelledLoad } from '../utils/LoadGeneration'
import * as Cesium from 'cesium'
import type {
  AddDataSourceOptions,
  DataSourceInput,
  DataSourceManager
} from '../datasource/DataSourceManager'
import type { EventBus } from '../events/EventBus'
import type { AddImageryOptions, ImageryManager, ImagerySource } from '../imagery/ImageryManager'
import type { AddTilesetOptions, TilesetManager, TilesetSource } from '../tileset/TilesetManager'
import type { CesiumKitEventMap } from '../types'
import { createId } from '../utils/assert'
import { createLogger, type Logger } from '../utils/logger'
import { LayerEntityGroup } from './LayerEntityGroup'
import {
  collectLeaves,
  createRootNode,
  findNode,
  flatten,
  insertNode,
  moveNode,
  refreshEffectiveState,
  removeNode,
  toSnapshot,
  type LayerNodeInternal
} from './tree'
import type {
  AddCustomLayerOptions,
  CustomLayerHandle,
  LayerChangeAction,
  LayerEntityGroupOptions,
  LayerKind,
  LayerNode,
  LayerNodeOptions,
  LayerRemoveOptions
} from './types'

export interface LayerManagerDeps {
  viewer: Cesium.Viewer
  imagery: ImageryManager
  dataSources: DataSourceManager
  tilesets: TilesetManager
  events?: EventBus<CesiumKitEventMap>
}

export type { AddCustomLayerOptions } from './types'
export type AddImageryLayerOptions = AddImageryOptions & LayerNodeOptions
export type AddDataSourceLayerOptions = AddDataSourceOptions & LayerNodeOptions
export type AddTilesetLayerOptions = AddTilesetOptions & LayerNodeOptions

function findSnapshot(nodes: LayerNode[], id: string): LayerNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findSnapshot(node.children, id)
    if (found) return found
  }
  return undefined
}

export class LayerManager {
  readonly root = createRootNode()
  private readonly entityGroups = new Map<string, LayerEntityGroup>()
  private readonly customLayers = new Map<string, CustomLayerHandle>()
  private readonly log: Logger
  private destroyed = false
  private pending = new Map<string, { token: object; cancel(): void }>()

  constructor(
    private readonly deps: LayerManagerDeps,
    logger?: Logger
  ) {
    this.log = logger ?? createLogger('layer')
  }

  get isDestroyed(): boolean {
    return this.destroyed
  }

  /** Attach an already-loaded resource without loading a duplicate. */
  attachSnapshotLayer(
    kind: Exclude<LayerKind, 'entities'>,
    sourceId: string | undefined,
    options: LayerNodeOptions
  ): LayerNode {
    this.assertAlive()
    if (kind === 'group') return this.createGroup(options.name ?? options.id ?? 'group', options)
    if (
      !sourceId ||
      (kind === 'imagery'
        ? !this.deps.imagery.get(sourceId)
        : kind === 'datasource'
          ? !this.deps.dataSources.get(sourceId)
          : !this.deps.tilesets.get(sourceId))
    )
      throw new Error('图层资源不存在')
    const node = this.makeNode(kind, options, sourceId)
    this.finishInsert(node, () => {}, options.parentId, options.index)
    return this.mustSnapshot(node.id)
  }

  createGroup(name: string, options: LayerNodeOptions = {}): LayerNode {
    this.assertAlive()
    const node = this.makeNode('group', { ...options, name })
    insertNode(this.root, node, options.parentId, options.index)
    refreshEffectiveState(this.root)
    this.applyVisibility()
    this.emit('add', node)
    return this.mustSnapshot(node.id)
  }

  /** 把插件自管的图元挂到图层树；显隐与透明度通过句柄回调。 */
  addCustom(name: string, options: AddCustomLayerOptions): LayerNode {
    this.assertAlive()
    const id = options.id ?? createId('custom')
    if (findNode(this.root, id)) {
      throw new Error(`@cesium-kit/core: 图层 id 已存在 "${id}"`)
    }
    const node = this.makeNode(
      'custom',
      {
        ...options,
        id,
        name: options.name ?? name,
        visible: options.visible ?? true
      }
    )
    try {
      insertNode(this.root, node, options.parentId, options.index)
    } catch (error) {
      options.handle.destroy?.()
      throw error
    }
    this.customLayers.set(id, options.handle)
    this.applyOrder()
    this.applyVisibility()
    this.emit('add', node)
    return this.mustSnapshot(id)
  }

  async addImagery(
    source: ImagerySource,
    options: AddImageryLayerOptions = {}
  ): Promise<LayerNode> {
    this.assertAlive()
    const id = options.id ?? createId('imagery')
    if (findNode(this.root, id) || this.pending.has(id)) {
      throw new Error(`@cesium-kit/core: 图层 id 已存在 "${id}"`)
    }
    const token = {}
    this.pending.set(id, { token, cancel: () => this.deps.imagery.remove(id) })
    try {
      await this.deps.imagery.add(source, {
        id,
        show: options.show,
        alpha: options.alpha,
        index: options.index
      })
      if (this.destroyed || this.pending.get(id)?.token !== token) throw cancelledLoad()
      const node = this.makeNode(
        'imagery',
        {
          ...options,
          id,
          name: options.name ?? id,
          visible: options.visible ?? options.show ?? true
        },
        id
      )
      this.finishInsert(node, () => this.deps.imagery.remove(id), options.parentId, options.index)
      return this.mustSnapshot(id)
    } finally {
      if (this.pending.get(id)?.token === token) this.pending.delete(id)
    }
  }

  async addDataSource(
    name: string,
    input: DataSourceInput,
    options: AddDataSourceLayerOptions = {}
  ): Promise<LayerNode> {
    this.assertAlive()
    const id = options.id ?? name
    if (findNode(this.root, id) || this.pending.has(id)) {
      throw new Error(`@cesium-kit/core: 图层 id 已存在 "${id}"`)
    }
    const token = {}
    this.pending.set(id, { token, cancel: () => this.deps.dataSources.remove(name) })
    try {
      await this.deps.dataSources.add(name, input, {
        show: options.show,
        flyTo: options.flyTo,
        style: options.style
      })
      if (this.destroyed || this.pending.get(id)?.token !== token) throw cancelledLoad()
      const node = this.makeNode(
        'datasource',
        {
          ...options,
          id,
          name: options.name ?? name,
          visible: options.visible ?? options.show ?? true
        },
        name
      )
      this.finishInsert(
        node,
        () => this.deps.dataSources.remove(name),
        options.parentId,
        options.index
      )
      return this.mustSnapshot(id)
    } finally {
      if (this.pending.get(id)?.token === token) this.pending.delete(id)
    }
  }

  async addTileset(
    name: string,
    source: TilesetSource,
    options: AddTilesetLayerOptions = {}
  ): Promise<LayerNode> {
    this.assertAlive()
    const id = options.id ?? name
    if (findNode(this.root, id) || this.pending.has(id)) {
      throw new Error(`@cesium-kit/core: 图层 id 已存在 "${id}"`)
    }
    const token = {}
    this.pending.set(id, { token, cancel: () => this.deps.tilesets.remove(name) })
    try {
      await this.deps.tilesets.add(name, source, {
        show: options.show,
        maximumScreenSpaceError: options.maximumScreenSpaceError,
        shadows: options.shadows,
        preloadWhenHidden: options.preloadWhenHidden,
        style: options.style,
        flyTo: options.flyTo,
        tilesetOptions: options.tilesetOptions
      })
      if (this.destroyed || this.pending.get(id)?.token !== token) throw cancelledLoad()
      const node = this.makeNode(
        'tileset',
        {
          ...options,
          id,
          name: options.name ?? name,
          visible: options.visible ?? options.show ?? true
        },
        name
      )
      this.finishInsert(
        node,
        () => this.deps.tilesets.remove(name),
        options.parentId,
        options.index
      )
      return this.mustSnapshot(id)
    } finally {
      if (this.pending.get(id)?.token === token) this.pending.delete(id)
    }
  }

  async createEntityGroup(
    name: string,
    options: LayerEntityGroupOptions = {}
  ): Promise<LayerEntityGroup> {
    this.assertAlive()
    const id = options.id ?? createId('entities')
    if (findNode(this.root, id) || this.pending.has(id)) {
      throw new Error(`@cesium-kit/core: 图层 id 已存在 "${id}"`)
    }
    const dataSource = new Cesium.CustomDataSource(name)
    const token = {}
    this.pending.set(id, { token, cancel: () => {} })
    try {
      await this.deps.viewer.dataSources.add(dataSource)
      if (this.destroyed || this.pending.get(id)?.token !== token) {
        if (!this.deps.viewer.isDestroyed()) this.deps.viewer.dataSources.remove(dataSource, true)
        throw cancelledLoad()
      }
    } finally {
      if (this.pending.get(id)?.token === token) this.pending.delete(id)
    }
    const group = new LayerEntityGroup(id, name, dataSource)
    if (options.clustering !== undefined) group.setClustering(options.clustering)

    const node = this.makeNode(
      'entities',
      { ...options, id, name: options.name ?? name },
      undefined,
      dataSource
    )
    try {
      insertNode(this.root, node, options.parentId, options.index)
    } catch (error) {
      this.deps.viewer.dataSources.remove(dataSource, true)
      throw error
    }
    this.entityGroups.set(id, group)
    this.applyOrder()
    this.applyVisibility()
    this.emit('add', node)
    return group
  }

  get(id: string): LayerNode | undefined {
    return findSnapshot(toSnapshot(this.root), id)
  }

  getEntityGroup(id: string): LayerEntityGroup | undefined {
    return this.entityGroups.get(id)
  }

  tree(): LayerNode[] {
    return toSnapshot(this.root)
  }

  move(id: string, parentId: string, index: number): void {
    this.assertAlive()
    moveNode(this.root, id, parentId, index)
    this.applyOrder()
    this.applyVisibility()
    this.emit('move', findNode(this.root, id))
  }

  setVisible(id: string, visible: boolean): void {
    this.assertAlive()
    const node = findNode(this.root, id)
    if (!node) {
      this.log.debug(`??????${id}`)
      return
    }
    node.visible = visible
    this.applyVisibility()
    this.emit('visibility', node)
  }

  setAlpha(id: string, alpha: number): void {
    this.assertAlive()
    const node = findNode(this.root, id)
    if (!node) {
      this.log.debug(`??????${id}`)
      return
    }
    node.alpha = Math.min(1, Math.max(0, alpha))
    this.applyVisibility()
    this.emit('alpha', node)
  }

  remove(id: string, options: LayerRemoveOptions = {}): void {
    this.assertAlive()
    this.pending.get(id)?.cancel()
    this.pending.delete(id)
    const node = findNode(this.root, id)
    if (!node) return
    const removeSource = options.removeSource !== false
    this.removeSubtree(node, removeSource)
    this.applyOrder()
    this.applyVisibility()
    this.emit('remove', node)
    this.requestRender()
  }

  clear(options: LayerRemoveOptions = {}): void {
    this.assertAlive()
    this.pending.forEach((item) => item.cancel())
    this.pending.clear()
    const ids = this.root.children.map((child) => child.id)
    ids.forEach((id) => this.remove(id, options))
  }

  destroy(): void {
    if (this.destroyed) return
    this.pending.forEach((item) => item.cancel())
    this.pending.clear()
    this.destroyed = true
    if (!this.deps.viewer.isDestroyed()) {
      const ids = this.root.children.map((child) => child.id)
      ids.forEach((id) => {
        const node = findNode(this.root, id)
        if (node) this.removeSubtree(node, true)
      })
    }
    this.root.children = []
    this.entityGroups.clear()
    this.customLayers.clear()
  }

  private removeSubtree(node: LayerNodeInternal, removeSource: boolean): void {
    node.children.slice().forEach((child) => this.removeSubtree(child, removeSource))

    if (removeSource) {
      if (node.kind === 'imagery' && node.sourceId) {
        this.deps.imagery.remove(node.sourceId)
      } else if (node.kind === 'datasource' && node.sourceId) {
        this.deps.dataSources.remove(node.sourceId)
      } else if (node.kind === 'tileset' && node.sourceId) {
        this.deps.tilesets.remove(node.sourceId)
      } else if (node.kind === 'entities' && node.dataSource) {
        const group = this.entityGroups.get(node.id)
        group?.destroy()
        this.deps.viewer.dataSources.remove(node.dataSource, true)
      } else if (node.kind === 'custom') {
        this.customLayers.get(node.id)?.destroy?.()
      }
    }

    this.entityGroups.delete(node.id)
    this.customLayers.delete(node.id)
    removeNode(this.root, node.id)
  }

  private finishInsert(
    node: LayerNodeInternal,
    rollback: () => void,
    parentId?: string,
    index?: number
  ): void {
    try {
      insertNode(this.root, node, parentId, index)
    } catch (error) {
      rollback()
      throw error
    }
    this.applyOrder()
    this.applyVisibility()
    this.emit('add', node)
    this.requestRender()
  }

  private makeNode(
    kind: LayerKind,
    options: LayerNodeOptions,
    sourceId?: string,
    dataSource?: Cesium.CustomDataSource
  ): LayerNodeInternal {
    const id = options.id ?? createId(kind)
    return {
      id,
      name: options.name ?? id,
      kind,
      parentId: null,
      visible: options.visible ?? true,
      effectiveVisible: true,
      alpha: options.alpha ?? 1,
      effectiveAlpha: 1,
      sourceId,
      dataSource,
      children: []
    }
  }

  private applyOrder(): void {
    this.applyImageryOrder()
    this.applyDataSourceOrder()
    this.applyTilesetOrder()
    this.applyCustomOrder()
    this.requestRender()
  }

  private applyImageryOrder(): void {
    const collection = this.deps.viewer.imageryLayers
    const layers = collectLeaves(this.root, 'imagery')
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      const id = layers[i]?.sourceId
      const layer = id ? this.deps.imagery.get(id) : undefined
      if (layer && typeof collection.raiseToTop === 'function') {
        collection.raiseToTop(layer)
      }
    }
  }

  private applyDataSourceOrder(): void {
    const collection = this.deps.viewer.dataSources
    const nodes = flatten(this.root).filter(
      (node) => node.kind === 'datasource' || node.kind === 'entities'
    )
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const node = nodes[i]
      if (!node) continue
      const dataSource =
        node.kind === 'datasource'
          ? node.sourceId
            ? this.deps.dataSources.get(node.sourceId)
            : undefined
          : node.dataSource
      if (dataSource && typeof collection.raiseToTop === 'function') {
        collection.raiseToTop(dataSource)
      }
    }
  }

  private applyTilesetOrder(): void {
    const collection = this.deps.viewer.scene.primitives
    const nodes = collectLeaves(this.root, 'tileset')
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const id = nodes[i]?.sourceId
      const tileset = id ? this.deps.tilesets.get(id) : undefined
      if (tileset && typeof collection.raiseToTop === 'function') {
        collection.raiseToTop(tileset)
      }
    }
  }

  private applyCustomOrder(): void {
    const nodes = collectLeaves(this.root, 'custom')
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const node = nodes[i]
      if (node) this.customLayers.get(node.id)?.raiseToTop?.()
    }
  }

  private applyVisibility(): void {
    refreshEffectiveState(this.root)
    collectLeaves(this.root, 'imagery').forEach((node) => {
      const layer = node.sourceId ? this.deps.imagery.get(node.sourceId) : undefined
      if (!layer) return
      layer.show = node.effectiveVisible
      layer.alpha = node.effectiveAlpha
    })
    collectLeaves(this.root, 'custom').forEach((node) => {
      const handle = this.customLayers.get(node.id)
      if (!handle) return
      handle.setVisible?.(node.effectiveVisible)
      handle.setAlpha?.(node.effectiveAlpha)
    })
    collectLeaves(this.root, 'datasource').forEach((node) => {
      const dataSource = node.sourceId ? this.deps.dataSources.get(node.sourceId) : undefined
      if (dataSource) dataSource.show = node.effectiveVisible
    })
    collectLeaves(this.root, 'tileset').forEach((node) => {
      const tileset = node.sourceId ? this.deps.tilesets.get(node.sourceId) : undefined
      if (tileset) tileset.show = node.effectiveVisible
    })
    collectLeaves(this.root, 'entities').forEach((node) => {
      if (node.dataSource) node.dataSource.show = node.effectiveVisible
    })
    this.requestRender()
  }

  private emit(action: LayerChangeAction, node?: LayerNodeInternal): void {
    this.deps.events?.emit('layer:change', {
      action,
      id: node?.id ?? this.root.id,
      parentId: node?.parentId ?? undefined
    })
  }

  private mustSnapshot(id: string): LayerNode {
    const snapshot = this.get(id)
    if (!snapshot) throw new Error(`@cesium-kit/core: 图层创建失败 "${id}"`)
    return snapshot
  }

  private requestRender(): void {
    if (!this.deps.viewer.isDestroyed()) this.deps.viewer.scene.requestRender()
  }

  private assertAlive(): void {
    if (this.destroyed) {
      throw new Error('@cesium-kit/core: LayerManager 已销毁')
    }
  }
}
