import * as Cesium from 'cesium'
import { describe, expect, it, vi } from 'vitest'
import { MarkerClusterLayer } from '../src/cluster/MarkerClusterLayer'
import type { MarkerInput } from '../src/cluster/types'

function createHarness() {
  const viewer = {
    dataSources: {
      add: vi.fn((source: Cesium.DataSource) => Promise.resolve(source)),
      remove: vi.fn(() => true)
    },
    scene: { requestRender: vi.fn() },
    flyTo: vi.fn(() => Promise.resolve(true)),
    isDestroyed: () => false
  } as unknown as Cesium.Viewer

  const onMarkerClick = vi.fn()
  const onClusterClick = vi.fn()
  const layer = new MarkerClusterLayer(viewer, {
    id: 'cities',
    onMarkerClick,
    onClusterClick,
    defaultClusterAction: 'none'
  })

  return { viewer, layer, onMarkerClick, onClusterClick }
}

const MARKERS: MarkerInput[] = [
  { id: 'beijing', position: { lon: 116.39, lat: 39.9 }, label: '北京' },
  { id: 'shanghai', position: { lon: 121.47, lat: 31.23 }, label: '上海' }
]

describe('MarkerClusterLayer', () => {
  it('添加、移除与清空标注', () => {
    const { layer } = createHarness()
    const entities = layer.addMany(MARKERS)
    expect(layer.size).toBe(2)
    expect(entities[0]?.id).toBe('cities:beijing')
    expect(layer.dataSource.entities.values).toHaveLength(2)

    expect(layer.remove('beijing')).toBe(true)
    expect(layer.size).toBe(1)
    layer.clear()
    expect(layer.size).toBe(0)
    layer.destroy()
  })

  it('聚合配置可动态更新', () => {
    const { layer } = createHarness()
    expect(layer.dataSource.clustering.pixelRange).toBe(60)

    layer.setClustering({ pixelRange: 90, minimumClusterSize: 4 })
    expect(layer.dataSource.clustering.pixelRange).toBe(90)
    expect(layer.dataSource.clustering.minimumClusterSize).toBe(4)

    layer.setClustering(false)
    expect(layer.dataSource.clustering.enabled).toBe(false)
    layer.destroy()
  })

  it('单体标注点击回调', () => {
    const { layer, onMarkerClick } = createHarness()
    const entity = layer.add(MARKERS[0] as MarkerInput)
    expect(layer.handlePick(entity)).toBe(true)
    expect(onMarkerClick).toHaveBeenCalledWith(MARKERS[0], entity)
    layer.destroy()
  })

  it('聚合点击回调并传递实体集合', () => {
    const { layer, onClusterClick } = createHarness()
    const a = layer.add(MARKERS[0] as MarkerInput)
    const b = layer.add(MARKERS[1] as MarkerInput)

    expect(layer.handlePick({ id: [a.id, b.id] })).toBe(true)
    expect(onClusterClick).toHaveBeenCalledOnce()
    const [markers, entities] = onClusterClick.mock.calls[0] as [
      MarkerInput[],
      Cesium.Entity[]
    ]
    expect(markers.map((marker) => marker.id)).toEqual(['beijing', 'shanghai'])
    expect(entities.map((entity) => entity.id)).toEqual([a.id, b.id])
    layer.destroy()
  })

  it('显隐与销毁清理数据源', () => {
    const { layer, viewer } = createHarness()
    layer.add(MARKERS[0] as MarkerInput)
    layer.setVisible(false)
    expect(layer.dataSource.show).toBe(false)

    layer.destroy()
    expect(viewer.dataSources.remove).toHaveBeenCalledWith(layer.dataSource, true)
  })
})
