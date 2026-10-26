# 图层树与顺序管理

`LayerManager` 将底图、GeoJSON/CZML/KML 数据源、3D Tiles 与实体组统一到一棵可嵌套的树中，提供显隐级联、同级排序与删除能力。

## 快速开始

```ts
const layers = manager.layerManager

const group = layers.createGroup('业务图层')

await layers.addImagery('osm', { parentId: group.id, alpha: 0.8 })

await layers.addDataSource(
  'rivers',
  { type: 'geojson', data: '/data/rivers.geojson' },
  { parentId: group.id, name: '河流' }
)

await layers.addTileset(
  'city',
  '/tiles/city/tileset.json',
  { parentId: group.id, name: '城市白模' }
)

const markers = await layers.createEntityGroup('城市标注', {
  clustering: { pixelRange: 80, minimumClusterSize: 2 }
})

layers.setVisible(group.id, false)
layers.setAlpha(group.id, 0.6)
layers.move('city', group.id, 0)
layers.remove('rivers')
```

`tree()` 返回可直接渲染的快照：

```ts
interface LayerNode {
  id: string
  name: string
  kind: 'group' | 'imagery' | 'datasource' | 'tileset' | 'entities'
  parentId: string | null
  visible: boolean
  effectiveVisible: boolean
  alpha: number
  effectiveAlpha: number
  sourceId?: string
  entityCount?: number
  children: LayerNode[]
}
```

## 排序语义

- 树中自上而下表示“由上层到下层”。
- 底图通过 `ImageryLayerCollection.raiseToTop` 应用顺序。
- 数据源与实体组通过 `DataSourceCollection.raiseToTop` 应用顺序。
- 3D Tiles 通过 `PrimitiveCollection.raiseToTop` 应用顺序。
- Cesium 的单个实体没有真正的 z-index，实体组只保证组级顺序；标签 / Billboard 置顶可通过 `disableDepthTestDistance` 等实体样式解决。

## 显隐与透明度

- `setVisible(id, false)` 会级联隐藏所有后代。
- `effectiveVisible` 是祖先可见性与自身可见性的组合。
- 透明度仅对底图叶子生效，按祖先链相乘得到 `effectiveAlpha`。

## 实体组

实体组底层是一个 `Cesium.CustomDataSource`，适合承载业务标注、聚合点等：

```ts
const group = await manager.layerManager.createEntityGroup('告警点', {
  clustering: { pixelRange: 60, minimumClusterSize: 2 }
})

group.add(new Cesium.Entity({ position, point: { pixelSize: 8 } }))
group.setClustering(false)
group.clear()
```

配合 `MarkerClusterLayer` 使用时，把 `group.dataSource` 传入即可共享聚合与图层树节点。

## 事件

```ts
manager.events.on('layer:change', ({ action, id, parentId }) => {
  console.log(action, id, parentId)
})
```

`action`：`add / remove / move / visibility / alpha / clear`。

## 生命周期

`manager.destroy()` 会先销毁图层树，再销毁底图、数据源与 3D Tiles 管理器，避免悬挂图层。

## Vue

```ts
import { useLayerManager } from '@cesium-kit/vue'

const { tree, setVisible, setAlpha, move, remove, addDataSource } = useLayerManager()
```

`tree` 会随 `layer:change` 自动刷新。
