import * as Cesium from 'cesium'
import type { LayerKind, LayerNode } from './types'

export interface LayerNodeInternal {
  id: string
  name: string
  kind: LayerKind
  parentId: string | null
  visible: boolean
  effectiveVisible: boolean
  alpha: number
  effectiveAlpha: number
  sourceId?: string
  dataSource?: Cesium.CustomDataSource
  children: LayerNodeInternal[]
}

export function createRootNode(): LayerNodeInternal {
  return {
    id: 'root',
    name: 'root',
    kind: 'group',
    parentId: null,
    visible: true,
    effectiveVisible: true,
    alpha: 1,
    effectiveAlpha: 1,
    children: []
  }
}

export function findNode(
  root: LayerNodeInternal,
  id: string
): LayerNodeInternal | undefined {
  if (root.id === id) return root
  for (const child of root.children) {
    const found = findNode(child, id)
    if (found) return found
  }
  return undefined
}

export function findParent(
  root: LayerNodeInternal,
  id: string
): LayerNodeInternal | undefined {
  for (const child of root.children) {
    if (child.id === id) return root
    const found = findParent(child, id)
    if (found) return found
  }
  return undefined
}

export function isDescendant(
  root: LayerNodeInternal,
  ancestorId: string,
  nodeId: string
): boolean {
  const ancestor = findNode(root, ancestorId)
  if (!ancestor) return false
  const target = findNode(root, nodeId)
  if (!target) return false
  let current = findParent(root, nodeId)
  while (current) {
    if (current.id === ancestorId) return true
    current = current.parentId ? findNode(root, current.parentId) : undefined
  }
  return false
}

export function insertNode(
  root: LayerNodeInternal,
  node: LayerNodeInternal,
  parentId = root.id,
  index?: number
): void {
  const parent = findNode(root, parentId)
  if (!parent) throw new Error(`@cesium-kit/core: 图层组不存在 "${parentId}"`)
  if (parent.kind !== 'group') {
    throw new Error(`@cesium-kit/core: 图层 "${parentId}" 不是分组，不能添加子节点`)
  }
  if (findNode(root, node.id)) {
    throw new Error(`@cesium-kit/core: 图层 id 已存在 "${node.id}"`)
  }
  node.parentId = parent.id
  if (index === undefined || index < 0 || index > parent.children.length) {
    parent.children.push(node)
  } else {
    parent.children.splice(index, 0, node)
  }
}

export function removeNode(
  root: LayerNodeInternal,
  id: string
): LayerNodeInternal | undefined {
  if (id === root.id) return undefined
  const parent = findParent(root, id)
  if (!parent) return undefined
  const index = parent.children.findIndex((child) => child.id === id)
  if (index < 0) return undefined
  const [removed] = parent.children.splice(index, 1)
  return removed
}

export function moveNode(
  root: LayerNodeInternal,
  id: string,
  parentId: string,
  index: number
): void {
  if (id === root.id) throw new Error('@cesium-kit/core: 不能移动根节点')
  if (id === parentId) throw new Error('@cesium-kit/core: 不能把分组移动到自身')
  if (isDescendant(root, id, parentId)) {
    throw new Error('@cesium-kit/core: 不能把分组移动到自己的子级')
  }
  const node = findNode(root, id)
  if (!node) throw new Error(`@cesium-kit/core: 图层不存在 "${id}"`)
  const target = findNode(root, parentId)
  if (!target) throw new Error(`@cesium-kit/core: 图层组不存在 "${parentId}"`)
  if (target.kind !== 'group') {
    throw new Error(`@cesium-kit/core: 图层 "${parentId}" 不是分组`)
  }

  const parent = findParent(root, id)
  if (parent) {
    const currentIndex = parent.children.findIndex((child) => child.id === id)
    if (currentIndex >= 0) parent.children.splice(currentIndex, 1)
  }

  const nextIndex = Math.max(0, Math.min(index, target.children.length))
  target.children.splice(nextIndex, 0, node)
  node.parentId = target.id
}

export function flatten(root: LayerNodeInternal): LayerNodeInternal[] {
  const result: LayerNodeInternal[] = []
  const visit = (node: LayerNodeInternal): void => {
    node.children.forEach((child) => {
      result.push(child)
      if (child.kind === 'group') visit(child)
    })
  }
  visit(root)
  return result
}

export function collectLeaves(
  root: LayerNodeInternal,
  kind: LayerKind
): LayerNodeInternal[] {
  return flatten(root).filter((node) => node.kind === kind)
}

export function refreshEffectiveState(root: LayerNodeInternal): void {
  const visit = (node: LayerNodeInternal, parentVisible: boolean, parentAlpha: number): void => {
    node.effectiveVisible = parentVisible && node.visible
    const alpha = parentAlpha * node.alpha
    node.effectiveAlpha = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 0
    node.children.forEach((child) => visit(child, node.effectiveVisible, node.effectiveAlpha))
  }
  root.effectiveVisible = root.visible
  root.effectiveAlpha = root.alpha
  root.children.forEach((child) => visit(child, root.effectiveVisible, root.alpha))
}

export function toSnapshot(root: LayerNodeInternal): LayerNode[] {
  refreshEffectiveState(root)
  return root.children.map((child) => snapshotNode(child))
}

function snapshotNode(node: LayerNodeInternal): LayerNode {
  return {
    id: node.id,
    name: node.name,
    kind: node.kind,
    parentId: node.parentId,
    visible: node.visible,
    effectiveVisible: node.effectiveVisible,
    alpha: node.alpha,
    effectiveAlpha: node.effectiveAlpha,
    sourceId: node.sourceId,
    entityCount: node.dataSource?.entities.values.length,
    children: node.children.map((child) => snapshotNode(child))
  }
}
