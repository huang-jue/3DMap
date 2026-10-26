# 图层与数据源

## 数据源（GeoJSON / CZML / KML）

```ts
await manager.dataSources.add(
  'rivers',
  { type: 'geojson', data: '/data/rivers.geojson' },
  {
    flyTo: true,
    style: {
      pointColor: '#67c23a',
      pointSize: 9,
      lineColor: '#409eff',
      lineWidth: 3,
      polygonColor: 'rgba(64, 158, 255, 0.25)',
      polygonOutlineColor: '#409eff',
      labelColor: '#ffffff',
      clampToGround: true
    }
  }
)

manager.dataSources.setStyle('rivers', { lineColor: '#e6a23c' })
manager.dataSources.setShow('rivers', false)
await manager.dataSources.flyTo('rivers')
manager.dataSources.remove('rivers')
manager.dataSources.clear()
```

- `data` 支持 URL、字符串内容或已解析对象
- 同名重复加载会先移除旧数据源
- `flyTo: true` 会在加载完成后执行视野定位（会等待飞行动画结束）

## 3D Tiles

```ts
await manager.tilesets.add('city', '/tiles/city/tileset.json', {
  maximumScreenSpaceError: 16,
  style: { color: 'color("#67c23a", 0.9)' },
  flyTo: true
})

manager.tilesets.setStyle('city', { show: '${Height} > 0' })
manager.tilesets.show('city', false)
await manager.tilesets.flyTo('city')
manager.tilesets.remove('city')
```

仓库内提供了一个**完全离线**的 3D Tiles 1.1 小样例（glTF 内容 + region 包围盒）：

```
apps/playground/public/tiles/demo/
├─ tileset.json
└─ tile.gltf
```

## WMS / WMTS

```ts
import { createWmsImagery, createWmtsImagery } from '@cesium-kit/core'

await manager.imagery.add(
  createWmsImagery({
    url: 'https://example.com/geoserver/wms',
    layers: 'workspace:roads',
    parameters: { styles: 'line' },
    transparent: true,
    format: 'image/png'
  }),
  { id: 'wms-roads' }
)

await manager.imagery.add(
  createWmtsImagery({
    url: 'https://example.com/wmts',
    layer: 'img',
    tileMatrixSetID: 'EPSG:3857',
    format: 'image/jpeg',
    maximumLevel: 18
  }),
  { id: 'wmts-img' }
)
```

## 在插件中使用

插件内不要直接操作 `viewer.dataSources` / `scene.primitives`，使用 `ctx.layers` 以便卸载时自动回收：

```ts
export const floodLayers: CesiumFeature = {
  name: 'flood-layers',
  async install(ctx) {
    await ctx.layers.dataSource({ type: 'geojson', data: '/data/zones.geojson' })
    await ctx.layers.tileset('/tiles/city/tileset.json', { maximumScreenSpaceError: 8 })
  }
}
```

`remove` 由内核在 `unregister` 时自动调用。
