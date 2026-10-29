import { findNode } from '../layer/tree'
import type { CesiumViewerManager } from '../viewer/CesiumViewerManager'
import type { AddDataSourceOptions, DataSourceInput } from '../datasource/DataSourceManager'
import type { AddTilesetOptions, TilesetSource } from '../tileset/TilesetManager'
import type { ImagerySource } from '../imagery/ImageryManager'
import type { LayerNode } from '../layer/types'
import type { DrawSession } from '../draw/types'
import { snapshotJSON } from './json'
import { validateSceneSnapshot } from './validate'
import type {
  SceneSnapshot,
  SnapshotCaptureResult,
  SnapshotIssue,
  SnapshotLayer,
  SnapshotResource,
  SnapshotResourceEntry,
  SnapshotRestoreOptions,
  SnapshotRestoreResult
} from './types'
import type { SnapshotExtensionAdapter } from './types'

interface OwnedResource {
  kind: SnapshotResourceEntry['kind']
  id: string
  value: unknown
}

/** capture() enrolls serializable content; restore() replaces only enrolled/restored objects. */
export class SceneSnapshotService {
  private registry = new Map<string, SnapshotResource>()
  private extensions = new Map<string, SnapshotExtensionAdapter>()
  private owned: OwnedResource[] = []
  private ownedNodes = new Map<string, object>()
  private ownedDrawings = new Set<DrawSession>()
  private restoring = false
  private destroyed = false
  private sequence = 0

  constructor(private readonly manager: CesiumViewerManager) {}

  registerExtension(id: string, adapter: SnapshotExtensionAdapter): () => void {
    this.assertAlive()
    if (!id || this.extensions.has(id) || ['__proto__', 'constructor', 'prototype'].includes(id))
      throw new Error('扩展 ID 为空、非法或已注册')
    this.extensions.set(id, adapter)
    return () => {
      if (this.extensions.get(id) === adapter) this.extensions.delete(id)
    }
  }

  registerResource(id: string, resource: SnapshotResource): () => void {
    this.assertAlive()
    if (!id || this.registry.has(id)) throw new Error('资源 ID 为空或已注册')
    this.registry.set(id, resource)
    return () => {
      if (this.registry.get(id) === resource) this.registry.delete(id)
    }
  }

  capture(): SnapshotCaptureResult {
    this.assertAlive()
    if (this.restoring) throw new Error('场景恢复期间不能保存')
    const m = this.manager
    const skipped: SnapshotIssue[] = []
    const resources: SnapshotResourceEntry[] = []
    const add = (
      kind: SnapshotResourceEntry['kind'],
      id: string,
      source: unknown,
      options: unknown
    ): void => {
      try {
        const resourceRef = this.reference(kind, source)
        const entry: SnapshotResourceEntry = {
          id,
          kind,
          source: resourceRef ? null : snapshotJSON(source),
          resourceRef,
          options: snapshotJSON(options) as Record<string, unknown>
        }
        resources.push(entry)
        this.enroll(kind, id)
      } catch (error) {
        skipped.push({ id: `${kind}:${id}`, reason: this.message(error) })
      }
    }
    m.imagery.list().forEach((item) =>
      add('imagery', item.id, m.imagery.definition(item.id), {
        show: item.show,
        alpha: item.alpha
      })
    )
    m.dataSources.list().forEach((item) => {
      const definition = m.dataSources.definition(item.name)
      if (definition)
        add('datasource', item.name, definition.source, {
          ...definition.options,
          show: item.show,
          flyTo: false
        })
    })
    m.tilesets.list().forEach((item) => {
      const definition = m.tilesets.definition(item.name)
      if (definition)
        add('tileset', item.name, definition.source, {
          ...definition.options,
          show: item.show,
          maximumScreenSpaceError: item.maximumScreenSpaceError,
          flyTo: false
        })
    })
    const walk = (nodes: LayerNode[]): SnapshotLayer[] =>
      nodes.flatMap((node): SnapshotLayer[] => {
        if (node.kind === 'entities') {
          skipped.push({
            id: node.id,
            reason: '实体组包含运行时 Entity；请使用绘制成果或 GeoJSON 数据源保存'
          })
          return []
        }
        if (node.kind === 'custom') {
          skipped.push({
            id: node.id,
            reason: '自定义图层由插件运行时管理，不参与场景快照'
          })
          return []
        }
        if (
          node.kind !== 'group' &&
          !resources.some((entry) => entry.kind === node.kind && entry.id === node.sourceId)
        )
          return []
        this.ownedNodes.set(node.id, findNode(m.layerManager.root, node.id)!)
        return [
          {
            id: node.id,
            name: node.name,
            kind: node.kind,
            visible: node.visible,
            alpha: node.alpha,
            resourceId: node.sourceId,
            children: walk(node.children)
          }
        ]
      })
    let terrain: SceneSnapshot['terrain']
    if (m.terrain.current !== 'custom') terrain = { source: m.terrain.current }
    else {
      const resourceRef = this.reference('terrain', m.terrain.source)
      terrain = resourceRef ? { resourceRef } : { source: 'ellipsoid' }
      if (!resourceRef)
        skipped.push({ id: 'terrain', reason: '自定义地形未注册资源 ID；快照使用椭球地形' })
    }
    const clock = m.clock.state
    const snapshot: SceneSnapshot = {
      version: 1,
      camera: m.camera.getView(),
      mode: m.scene.getMode(),
      terrain,
      resources,
      layers: walk(m.layerManager.tree()),
      drawings: m.draw.exportGeoJSON(),
      clock: {
        ...clock,
        currentTime: clock.currentTime.toISOString(),
        startTime: clock.startTime?.toISOString() ?? null,
        stopTime: clock.stopTime?.toISOString() ?? null
      }
    }
    const extensions: Record<string, unknown> = {}
    for (const [id, adapter] of this.extensions) {
      try {
        extensions[id] = snapshotJSON(adapter.capture())
      } catch (error) {
        skipped.push({ id: `extension:${id}`, reason: this.message(error) })
      }
    }
    if (Object.keys(extensions).length) snapshot.extensions = extensions
    m.draw.sessionList
      .filter((session) => session.state === 'completed')
      .forEach((session) => this.ownedDrawings.add(session))
    if (
      m.viewer.entities.values.some(
        (entity) => !m.draw.ownsEntity(entity) && !entity.id.startsWith('cesium-kit-highlight-')
      )
    ) {
      skipped.push({ id: 'entities', reason: '独立运行时 Entity 不包含在快照中' })
    }
    return { snapshot: validateSceneSnapshot(snapshot), skipped }
  }

  async restore(
    input: unknown,
    options: SnapshotRestoreOptions = {}
  ): Promise<SnapshotRestoreResult> {
    this.assertAlive()
    if (this.restoring) throw new Error('已有场景恢复任务正在进行')
    const data = validateSceneSnapshot(input)
    this.restoring = true
    const result: SnapshotRestoreResult = { succeeded: [], failed: [], skipped: [] }
    try {
      // Resolve all opaque references BEFORE changing the scene. Missing references are fatal.
      const resolved = new Map<string, SnapshotResource>()
      const references = [
        ...data.resources
          .filter((entry) => entry.resourceRef)
          .map((entry) => ({ id: entry.resourceRef!, kind: entry.kind })),
        ...(data.terrain.resourceRef
          ? [{ id: data.terrain.resourceRef, kind: 'terrain' as const }]
          : [])
      ]
      for (const ref of references) {
        const resource =
          this.registry.get(ref.id) ?? (await options.resolveResource?.(ref.id, ref.kind))
        if (!resource || resource.kind !== ref.kind)
          throw new Error(`资源引用缺失或类型不匹配：${ref.id}`)
        resolved.set(`${ref.kind}:${ref.id}`, resource)
      }
      this.assertAlive()
      for (const ref of references) {
        if (!this.registry.has(ref.id))
          this.registry.set(ref.id, resolved.get(`${ref.kind}:${ref.id}`)!)
      }
      this.releaseOwned()
      const m = this.manager
      const names = new Map<string, string>()
      const safeId = (id: string, occupied: (id: string) => boolean): string => {
        let name = id
        while (occupied(name)) name = `snapshot-${++this.sequence}-${id}`
        return name
      }
      for (const entry of data.resources) {
        try {
          this.assertAlive()
          const source = entry.resourceRef
            ? resolved.get(`${entry.kind}:${entry.resourceRef}`)!.source
            : entry.source
          const id = safeId(entry.id, (name) => Boolean(this.value(entry.kind, name)))
          const opts = { ...entry.options, flyTo: false }
          if (entry.kind === 'imagery')
            await m.imagery.add(source as ImagerySource, { ...opts, id })
          else if (entry.kind === 'datasource')
            await m.dataSources.add(id, source as DataSourceInput, opts as AddDataSourceOptions)
          else await m.tilesets.add(id, source as TilesetSource, opts as AddTilesetOptions)
          this.assertAlive()
          names.set(`${entry.kind}:${entry.id}`, id)
          this.enroll(entry.kind, id)
          result.succeeded.push(`${entry.kind}:${entry.id}`)
        } catch (error) {
          this.assertAlive()
          result.failed.push({ id: `${entry.kind}:${entry.id}`, reason: this.message(error) })
        }
      }
      const attach = (nodes: SnapshotLayer[], parentId?: string): void => {
        for (const node of nodes) {
          const sourceId =
            node.kind === 'group' ? undefined : names.get(`${node.kind}:${node.resourceId}`)
          if (node.kind !== 'group' && !sourceId) {
            result.skipped.push({ id: node.id, reason: '图层资源加载失败' })
            continue
          }
          const id = safeId(node.id, (name) => Boolean(m.layerManager.get(name)))
          m.layerManager.attachSnapshotLayer(node.kind, sourceId, {
            id,
            name: node.name,
            parentId,
            visible: node.visible,
            alpha: node.alpha
          })
          this.ownedNodes.set(id, findNode(m.layerManager.root, id)!)
          attach(node.children, id)
        }
      }
      attach(data.layers)
      m.draw.importGeoJSON(data.drawings).forEach((session) => this.ownedDrawings.add(session))
      result.succeeded.push('drawings')
      try {
        await m.terrain.set(
          data.terrain.resourceRef
            ? (
                resolved.get(`terrain:${data.terrain.resourceRef}`)! as Extract<
                  SnapshotResource,
                  { kind: 'terrain' }
                >
              ).source
            : data.terrain.source!
        )
        this.assertAlive()
        result.succeeded.push('terrain')
      } catch (error) {
        this.assertAlive()
        result.failed.push({ id: 'terrain', reason: this.message(error) })
      }
      const restoredExtensions: Array<[string, SnapshotExtensionAdapter, unknown]> = []
      for (const [id, state] of Object.entries(data.extensions ?? {})) {
        const adapter = this.extensions.get(id)
        if (!adapter) {
          result.skipped.push({ id: `extension:${id}`, reason: '未注册的场景扩展' })
          continue
        }
        try {
          await adapter.restore(state)
          this.assertAlive()
          restoredExtensions.push([id, adapter, state])
          result.succeeded.push(`extension:${id}`)
        } catch (error) {
          result.failed.push({ id: `extension:${id}`, reason: this.message(error) })
        }
      }
      this.assertAlive()
      m.scene.setMode(data.mode, 0)
      m.camera.setView(data.camera, data.camera)
      m.clock.pause()
      m.clock.seek(data.clock.currentTime)
      if (data.clock.startTime && data.clock.stopTime)
        m.clock.setRange(new Date(data.clock.startTime), new Date(data.clock.stopTime))
      else m.clock.clearRange()
      m.clock.setMultiplier(data.clock.multiplier)
      m.clock.loop(data.clock.loop)
      for (const [id, adapter, state] of restoredExtensions) {
        try {
          await adapter.afterRestore?.(state)
        } catch (error) {
          result.failed.push({ id: `extension:${id}`, reason: this.message(error) })
        }
      }
      m.scene.requestRender()
      result.succeeded.push('camera', 'mode', 'clock')
      return result
    } finally {
      this.restoring = false
    }
  }

  saveLocal(key = 'cesium-kit:scene'): SnapshotCaptureResult {
    const result = this.capture()
    localStorage.setItem(key, JSON.stringify(result.snapshot))
    return result
  }

  async restoreLocal(
    key = 'cesium-kit:scene',
    options?: SnapshotRestoreOptions
  ): Promise<SnapshotRestoreResult> {
    const input = localStorage.getItem(key)
    if (!input) throw new Error('没有已保存的本地场景')
    return this.restore(input, options)
  }

  destroy(): void {
    this.destroyed = true
    this.registry.clear()
    this.extensions.clear()
    this.owned = []
    this.ownedNodes.clear()
    this.ownedDrawings.clear()
  }

  private reference(kind: SnapshotResource['kind'], source: unknown): string | undefined {
    return [...this.registry].find(
      ([, resource]) => resource.kind === kind && resource.source === source
    )?.[0]
  }

  private value(kind: SnapshotResourceEntry['kind'], id: string): unknown {
    const m = this.manager
    return kind === 'imagery'
      ? m.imagery.get(id)
      : kind === 'datasource'
        ? m.dataSources.get(id)
        : m.tilesets.get(id)
  }

  private enroll(kind: SnapshotResourceEntry['kind'], id: string): void {
    const value = this.value(kind, id)
    if (!this.owned.some((item) => item.value === value)) this.owned.push({ kind, id, value })
  }

  private releaseOwned(): void {
    const m = this.manager
    const owned = this.owned.filter((item) => this.value(item.kind, item.id) === item.value)
    const walk = (nodes: LayerNode[]): void => {
      for (const node of nodes) {
        walk(node.children)
        if (this.ownedNodes.get(node.id) !== findNode(m.layerManager.root, node.id)) continue
        if (node.kind === 'group') {
          if (!m.layerManager.get(node.id)?.children.length) m.layerManager.remove(node.id)
        } else if (owned.some((item) => item.kind === node.kind && item.id === node.sourceId))
          m.layerManager.remove(node.id, { removeSource: false })
      }
    }
    walk(m.layerManager.tree())
    owned.forEach(({ kind, id }) => {
      if (kind === 'imagery') m.imagery.remove(id)
      else if (kind === 'datasource') m.dataSources.remove(id)
      else m.tilesets.remove(id)
    })
    this.ownedDrawings.forEach((session) => session.remove())
    this.owned = []
    this.ownedNodes.clear()
    this.ownedDrawings.clear()
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
  private assertAlive(): void {
    if (this.destroyed || this.manager.isDestroyed()) throw new Error('SceneSnapshotService 已销毁')
  }
}
