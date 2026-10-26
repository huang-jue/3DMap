import type { SceneSnapshot, SnapshotLayer } from './types'
import { validateDrawGeoJSON } from '../draw/geojson'
import { snapshotJSON } from './json'

export function validateSceneSnapshot(input: unknown): SceneSnapshot {
  const data = snapshotJSON(typeof input === 'string' ? JSON.parse(input) : input) as SceneSnapshot
  if (!data || data.version !== 1) throw new Error('不支持的场景快照版本')
  if (!['3D', '2D', 'COLUMBUS_VIEW'].includes(data.mode)) throw new Error('非法场景模式')
  if (
    !data.camera ||
    !['lon', 'lat', 'height', 'heading', 'pitch', 'roll'].every((key) =>
      Number.isFinite(data.camera[key as keyof typeof data.camera])
    ) ||
    Math.abs(data.camera.lon) > 180 ||
    Math.abs(data.camera.lat) > 90
  )
    throw new Error('非法相机视角')
  if (
    !data.terrain ||
    (data.terrain.resourceRef
      ? typeof data.terrain.resourceRef !== 'string'
      : !['world', 'ellipsoid'].includes(data.terrain.source!))
  )
    throw new Error('非法地形引用')
  const clock = data.clock
  const date = (value: unknown): boolean =>
    typeof value === 'string' && Number.isFinite(Date.parse(value))
  if (
    !clock ||
    !date(clock.currentTime) ||
    !Number.isFinite(clock.multiplier) ||
    clock.multiplier === 0 ||
    typeof clock.loop !== 'boolean' ||
    typeof clock.running !== 'boolean' ||
    !(
      (clock.startTime === null && clock.stopTime === null) ||
      (date(clock.startTime) &&
        date(clock.stopTime) &&
        Date.parse(clock.startTime!) <= Date.parse(clock.stopTime!))
    )
  )
    throw new Error('非法时钟状态')
  validateDrawGeoJSON(data.drawings)
  if (!Array.isArray(data.resources) || !Array.isArray(data.layers))
    throw new Error('非法资源或图层列表')
  const resources = new Map<string, string>()
  for (const entry of data.resources) {
    if (
      !entry ||
      typeof entry.id !== 'string' ||
      !entry.id ||
      resources.has(`${entry.kind}:${entry.id}`) ||
      !['imagery', 'datasource', 'tileset'].includes(entry.kind) ||
      !entry.options ||
      typeof entry.options !== 'object' ||
      Array.isArray(entry.options)
    )
      throw new Error('非法或重复资源')
    resources.set(`${entry.kind}:${entry.id}`, entry.kind)
    if (entry.resourceRef !== undefined) {
      if (typeof entry.resourceRef !== 'string' || !entry.resourceRef)
        throw new Error('非法 resourceRef')
    } else if (entry.kind === 'imagery' || entry.kind === 'tileset') {
      if (typeof entry.source !== 'string' || !entry.source) throw new Error('非法资源来源')
    } else {
      const source = entry.source as { type: string; data: unknown }
      if (
        !source ||
        !['geojson', 'czml', 'kml'].includes(source.type) ||
        (typeof source.data !== 'string' && (!source.data || typeof source.data !== 'object'))
      )
        throw new Error('非法数据源')
    }
    for (const key of ['show', 'preloadWhenHidden'])
      if (entry.options[key] !== undefined && typeof entry.options[key] !== 'boolean')
        throw new Error(`非法资源选项 ${key}`)
    for (const key of ['alpha', 'maximumScreenSpaceError'])
      if (
        entry.options[key] !== undefined &&
        (!Number.isFinite(entry.options[key]) || (entry.options[key] as number) < 0)
      )
        throw new Error(`非法资源选项 ${key}`)
  }
  const ids = new Set<string>()
  const used = new Set<string>()
  const walk = (nodes: SnapshotLayer[]): void => {
    for (const node of nodes) {
      if (
        !node ||
        typeof node.id !== 'string' ||
        !node.id ||
        node.id === 'root' ||
        ids.has(node.id) ||
        typeof node.name !== 'string' ||
        !['group', 'imagery', 'datasource', 'tileset'].includes(node.kind) ||
        typeof node.visible !== 'boolean' ||
        !Number.isFinite(node.alpha) ||
        node.alpha < 0 ||
        node.alpha > 1 ||
        !Array.isArray(node.children)
      )
        throw new Error('非法或重复图层')
      ids.add(node.id)
      if (node.kind !== 'group') {
        const key = `${node.kind}:${node.resourceId}`
        if (!resources.has(key) || used.has(key) || node.children.length)
          throw new Error('图层资源引用不存在或重复')
        used.add(key)
      }
      walk(node.children)
    }
  }
  walk(data.layers)
  return data
}
