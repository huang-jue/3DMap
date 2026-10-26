import { describe, expect, it } from 'vitest'
import {
  collectLeaves,
  createRootNode,
  findNode,
  flatten,
  insertNode,
  moveNode,
  removeNode,
  toSnapshot,
  type LayerNodeInternal
} from '../src/layer/tree'

function node(
  id: string,
  kind: LayerNodeInternal['kind'],
  parentId: string | null = null
): LayerNodeInternal {
  return {
    id,
    name: id,
    kind,
    parentId,
    visible: true,
    effectiveVisible: true,
    alpha: 1,
    effectiveAlpha: 1,
    children: []
  }
}

describe('图层树纯函数', () => {
  it('插入、查找与快照', () => {
    const root = createRootNode()
    const group = node('g1', 'group')
    insertNode(root, group)
    insertNode(root, node('d1', 'datasource'), 'g1')

    expect(findNode(root, 'd1')?.parentId).toBe('g1')
    const tree = toSnapshot(root)
    expect(tree).toHaveLength(1)
    expect(tree[0]?.children[0]?.id).toBe('d1')
  })

  it('级联显隐与透明度', () => {
    const root = createRootNode()
    const group = node('g1', 'group')
    const leaf = node('i1', 'imagery')
    insertNode(root, group)
    insertNode(root, leaf, 'g1')
    group.alpha = 0.5
    leaf.alpha = 0.5
    group.visible = false

    const snapshot = toSnapshot(root)
    expect(snapshot[0]?.effectiveVisible).toBe(false)
    expect(snapshot[0]?.children[0]?.effectiveVisible).toBe(false)
    expect(snapshot[0]?.children[0]?.effectiveAlpha).toBeCloseTo(0.25)
  })

  it('移动节点并阻止移动到自身子级', () => {
    const root = createRootNode()
    const a = node('a', 'group')
    const b = node('b', 'group')
    const leaf = node('d1', 'datasource')
    insertNode(root, a)
    insertNode(root, b)
    insertNode(root, leaf, 'a')

    moveNode(root, 'd1', 'b', 0)
    expect(findNode(root, 'd1')?.parentId).toBe('b')
    expect(() => moveNode(root, 'a', 'd1', 0)).toThrow()

    const removed = removeNode(root, 'b')
    expect(removed?.id).toBe('b')
  })

  it('按深度优先顺序收集叶子', () => {
    const root = createRootNode()
    const group = node('g1', 'group')
    insertNode(root, group)
    insertNode(root, node('d1', 'datasource'), 'g1')
    insertNode(root, node('d2', 'datasource'))
    insertNode(root, node('t1', 'tileset'))

    expect(flatten(root).map((item) => item.id)).toEqual(['g1', 'd1', 'd2', 't1'])
    expect(collectLeaves(root, 'datasource').map((item) => item.id)).toEqual([
      'd1',
      'd2'
    ])
  })
})
