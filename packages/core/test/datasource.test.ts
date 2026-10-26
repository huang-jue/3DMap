import * as Cesium from 'cesium'
import { describe, expect, it, vi } from 'vitest'
import {
  DataSourceManager,
  type DataSourceLoaders
} from '../src/datasource/DataSourceManager'

function createHarness() {
  const pointEntity = new Cesium.Entity({
    id: 'p1',
    point: { pixelSize: 4, color: Cesium.Color.WHITE }
  })
  const lineEntity = new Cesium.Entity({
    id: 'l1',
    polyline: { positions: [Cesium.Cartesian3.fromDegrees(0, 0), Cesium.Cartesian3.fromDegrees(1, 1)] }
  })

  const createFakeDataSource = () =>
    ({
      show: true,
      entities: { values: [pointEntity, lineEntity] }
    }) as unknown as Cesium.GeoJsonDataSource

  const loaders = {
    geojson: vi.fn(async () => createFakeDataSource()),
    czml: vi.fn(async () => createFakeDataSource()),
    kml: vi.fn(async () => createFakeDataSource())
  } as unknown as Partial<DataSourceLoaders>

  const dataSources = {
    add: vi.fn(async (dataSource: Cesium.DataSource) => dataSource),
    remove: vi.fn(() => true)
  }

  const viewer = {
    dataSources,
    flyTo: vi.fn(async () => true),
    isDestroyed: () => false
  } as unknown as Cesium.Viewer

  const manager = new DataSourceManager(viewer, loaders)
  return { manager, viewer, loaders, dataSources, pointEntity, lineEntity }
}

describe('DataSourceManager', () => {
  it('按类型选择加载器并登记', async () => {
    const { manager, loaders } = createHarness()

    await manager.add('rivers', { type: 'geojson', data: '{}' })
    await manager.add('czml', { type: 'czml', data: '[]' })

    expect(loaders.geojson).toHaveBeenCalledOnce()
    expect(loaders.czml).toHaveBeenCalledOnce()
    expect(manager.size).toBe(2)
    expect(manager.list().map((item) => item.name)).toEqual(['rivers', 'czml'])
  })

  it('应用统一样式', async () => {
    const { manager, pointEntity, lineEntity } = createHarness()

    await manager.add(
      'rivers',
      { type: 'geojson', data: '{}' },
      {
        style: {
          pointColor: '#ff0000',
          pointSize: 12,
          lineColor: '#00ff00',
          lineWidth: 6,
          clampToGround: true
        }
      }
    )

    const pointColor = pointEntity.point?.color?.getValue(Cesium.JulianDate.now()) as {
      color?: Cesium.Color
    }
    expect(pointColor?.color?.toCssHexString()).toBe('#ff0000')
    expect(pointEntity.point?.pixelSize?.getValue()).toBe(12)
    expect(lineEntity.polyline?.width?.getValue()).toBe(6)
    expect(lineEntity.polyline?.clampToGround?.getValue()).toBe(true)
  })

  it('同名重复加载会先移除旧数据源', async () => {
    const { manager, dataSources } = createHarness()

    await manager.add('dup', { type: 'geojson', data: '{}' })
    await manager.add('dup', { type: 'geojson', data: '{}' })

    expect(dataSources.remove).toHaveBeenCalledTimes(1)
    expect(manager.size).toBe(1)
  })

  it('flyTo 选项会触发视图定位', async () => {
    const { manager, viewer } = createHarness()
    await manager.add('rivers', { type: 'geojson', data: '{}' }, { flyTo: true })
    expect(viewer.flyTo).toHaveBeenCalledOnce()
  })

  it('remove / clear / setShow 生效', async () => {
    const { manager, dataSources } = createHarness()
    await manager.add('a', { type: 'geojson', data: '{}' })
    await manager.add('b', { type: 'geojson', data: '{}' })

    manager.setShow('a', false)
    expect(manager.get('a')?.show).toBe(false)

    manager.remove('a')
    expect(dataSources.remove).toHaveBeenCalledOnce()

    manager.clear()
    expect(manager.size).toBe(0)
  })

  it('不支持的类型抛错', async () => {
    const { manager } = createHarness()
    await expect(
      manager.add('x', { type: 'wkt' as never, data: '' })
    ).rejects.toThrow('不支持的数据源类型')
  })

  it('destroy 后拒绝继续加载', async () => {
    const { manager } = createHarness()
    manager.destroy()
    await expect(manager.add('x', { type: 'geojson', data: '{}' })).rejects.toThrow('已销毁')
  })
})
