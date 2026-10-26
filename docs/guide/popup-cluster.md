# 弹窗与标注聚合

## 弹窗

`PopupService` 使用原生 DOM 渲染弹窗，不依赖任何 UI 框架。弹窗会随地图相机变化更新屏幕位置，并在 3D 下隐藏位于地球背面的内容。

```ts
const popup = manager.popup.open({
  position: { lon: 116.39, lat: 39.9 },
  title: '北京',
  content: '<div>全国政治、文化与国际交往中心</div>',
  offset: [0, -16],
  onClose: () => console.log('closed')
})

popup.setPosition({ lon: 121.47, lat: 31.23 })
popup.setContent('<b>上海</b>')
popup.setTitle('上海')
popup.close()

manager.popup.closeAll()
```

也可以传入真实 DOM，便于宿主挂载复杂内容：

```ts
const element = document.createElement('div')
element.textContent = '自定义内容'

manager.popup.open({
  position,
  content: element
})
```

弹窗默认样式可以通过 CSS 变量覆盖：

```css
:root {
  --cesium-kit-popup-bg: #111827;
  --cesium-kit-popup-color: #f9fafb;
  --cesium-kit-popup-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
}
```

## Vue 弹窗组件

```vue
<CesiumPopup v-model:visible="visible" :position="position" title="城市信息">
  <div>弹窗内容</div>
</CesiumPopup>
```

组件内部使用 `Teleport` 将插槽内容挂载到弹窗宿主，关闭按钮会同步 `visible`。

## 标注聚合

`MarkerClusterLayer` 基于 Cesium 内置 `EntityCluster`，用 `CustomDataSource` 承载标注：

```ts
import { MarkerClusterLayer } from '@cesium-kit/core'

const layer = new MarkerClusterLayer(manager.viewer, {
  id: 'cities',
  pixelRange: 80,
  minimumClusterSize: 2,
  clusterColor: '#2563eb',
  pick: manager.pick,
  onMarkerClick(marker) {
    manager.popup.open({
      position: marker.position,
      title: marker.name,
      content: marker.label ?? ''
    })
  }
})

layer.addMany([
  { id: 'beijing', position: { lon: 116.39, lat: 39.9 }, label: '北京' },
  { id: 'shanghai', position: { lon: 121.47, lat: 31.23 }, label: '上海' }
])

layer.setClustering({ pixelRange: 60 })
layer.setClustering(false)
layer.setVisible(false)
layer.remove('beijing')
layer.clear()
layer.destroy()
```

传入 `pick` 后会自动监听点击：

- 点击单体标注触发 `onMarkerClick`。
- 点击聚合点触发 `onClusterClick`，默认行为是 `viewer.flyTo(entities)` 放大；设置 `defaultClusterAction: 'none'` 可关闭默认行为。

与图层树共享实体组：

```ts
const group = await manager.layerManager.createEntityGroup('城市标注')
const layer = new MarkerClusterLayer(manager.viewer, {
  dataSource: group.dataSource,
  pick: manager.pick
})
```

## Vue

```ts
import { useMarkerCluster, usePopup } from '@cesium-kit/vue'

const { open, closeAll } = usePopup()
const { layer, add, addMany, clear, setClustering } = useMarkerCluster({
  layerGroup: '城市标注',
  pixelRange: 80,
  onMarkerClick: (marker) => {
    open({ position: marker.position, title: marker.name, content: marker.label ?? '' })
  }
})
```

`layerGroup` 会自动创建同名实体组并纳入图层树；组件卸载时聚合层自动销毁。
