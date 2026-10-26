# @cesium-kit/vue

## 组件

```vue
<CesiumViewer
  v-model:base-layer="baseLayer"
  v-model:scene-mode="sceneMode"
  :options="options"
  ion-token="..."
  :auto-init="true"
  @ready="onReady"
  @error="onError"
  @camera-change="onCamera"
  @imagery-change="onImagery"
  @scene-mode="onMode"
  @destroyed="onDestroyed"
/>
```

### Props

| 名称 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `options` | `CesiumKitOptions` | - | 初始化选项，仅首次生效 |
| `ionToken` | `string` | - | 覆盖全局 token |
| `baseLayer` | `string` | - | 初始底图 id，变化时自动切换 |
| `sceneMode` | `SceneModeName` | - | 初始投影，变化时自动切换 |
| `autoInit` | `boolean` | `true` | 是否自动初始化 |

| Events | 参数 |
| --- | --- |
| `ready` | `CesiumViewerManager` |
| `error` | `CesiumKitErrorPayload`（`source` / `error` / `detail`） |
| `camera-change` | `CameraView` |
| `imagery-change` | `string \| null` |
| `scene-mode` | `SceneModeName` |
| `update:baseLayer` | `string \| null` |
| `update:sceneMode` | `SceneModeName` |
| `destroyed` | - |

### Expose

`manager`、`whenReady()`、`init()`、`destroy()`、`getViewer()`、`flyHome(duration?)`、`setSceneMode(mode, duration?)`、`switchBaseLayer(id)`。

### 插槽

默认插槽渲染在地图之上，composables 在插槽内可用。

## Composables

### `useViewer()`

```ts
const { manager, viewer, ready, error, whenReady, getViewer } = useViewer()
```

### `useCamera(options?)`

```ts
const { view, flyTo, flyHome, setView, getView } = useCamera({ track: true })
```

`view` 为 `Ref<CameraView | null>`，由 `camera.changed` 事件驱动。

### `useImagery()`

```ts
const { layers, active, add, switchTo, remove, setAlpha, setShow, refresh } = useImagery()
```

### `useEntities()`

```ts
const { count, add, addMany, remove, clear, list, filter } = useEntities()
```

实体图形使用 `@cesium-kit/core` 的工厂，`useEntities()` 负责加入当前 Viewer：

```vue
<script setup lang="ts">
import { createLabel, createPoint } from '@cesium-kit/core'
import { useEntities } from '@cesium-kit/vue'

const { add } = useEntities()

await add(
  createPoint({
    position: { lon: 116.39, lat: 39.9 },
    color: '#409eff',
    clampToGround: true
  })
)

await add(
  createLabel({
    position: { lon: 116.39, lat: 39.9, height: 30 },
    text: '北京',
    pixelOffset: [0, -14],
    clampToGround: true
  })
)
</script>
```

`createLabel()` 还支持 `font`、`fillColor`、`outlineColor`、`outlineWidth`、`scale`、
`backgroundColor`、`showBackground` 和 `distanceDisplayCondition`。只有需要
`CallbackProperty` 等工厂未覆盖的 Cesium 能力时，才需要手动构造 `Cesium.Entity`；
构造后仍通过 `add()` 加入，不要直接操作 `viewer.entities`。

### `useSceneMode()`

```ts
const { mode, setMode, getMode } = useSceneMode()
```

### `useFeature(feature, options?)`

```ts
const { registered, error, register, unregister } = useFeature(feature, options)
```

组件挂载时注册插件，卸载时注销并回收图层。

### `usePick(options?)`

```ts
const { last, hovered, pickAt, setEnabled } = usePick({ hover: true, hoverInterval: 100 })
```

`last` / `hovered` 为 `Ref<PickEventPayload | null>`，包含经纬度、屏幕坐标与命中实体。

### `useDraw()`

```ts
const { active, drawing, results, start, cancel, clear } = useDraw()
```

`active` 为当前绘制 / 编辑会话，`results` 为已完成结果列表。

### `useLayerManager()`

```ts
const { tree, refresh, createGroup, addImagery, addDataSource, addTileset, createEntityGroup, move, setVisible, setAlpha, remove, clear } =
  useLayerManager()
```

`tree` 为响应式图层快照，随 `layer:change` 自动刷新。

### `usePopup()`

```ts
const { popups, open, close, closeAll } = usePopup()
```

组件卸载时会关闭由当前组合式函数打开的弹窗。

### `useMarkerCluster(options?)`

```ts
import { usePopup } from '@cesium-kit/vue'

const { open } = usePopup()
const { layer, add, addMany, remove, clear, setVisible, setClustering } =
  useMarkerCluster({
    layerGroup: '城市标注',
    pixelRange: 80,
    onMarkerClick: (marker) => open({ position: marker.position, content: marker.label })
  })
```

`layerGroup` 会自动创建同名实体组并纳入图层树；`bindPick` 默认为 `true`。

### `CesiumPopup`

```vue
<CesiumPopup v-model:visible="visible" :position="position" title="标题">
  <div>内容</div>
</CesiumPopup>
```

Props：`visible / position / title / offset / closable / showAnchor / className`；事件：`open / close / update:visible`。

### `useCameraShare()`

```ts
const { getUrl, applyFromUrl, copyUrl } = useCameraShare()
```

基于 URL hash 的视角分享，`copyUrl` 内部使用剪贴板 API。

### `useClock()`

```ts
const { state, play, pause, toggle, seek, setMultiplier, stepForward, stepBackward, onTick } =
  useClock()
```

`state` 为 `Ref<ClockState | null>`，与 `FeatureContext.clock` 同源。

## 全局插件

```ts
app.use(CesiumKit, {
  ionToken: '...',
  defaultViewerOptions: { showCredits: false }
})
```

## 上下文

```ts
import { useCesiumContext, createCesiumContext, whenReadySafe } from '@cesium-kit/vue'
```

自定义组件若需要直接访问上下文，可使用 `useCesiumContext()`；它会在脱离 `<CesiumViewer>` 时抛出明确错误。

## 样式

```ts
import '@cesium-kit/vue/style.css'
```

只包含组件的容器样式，不含 reset，不会污染宿主。


## 持久化与选择

`useDraw()` 新增异步 `exportGeoJSON()`、`importGeoJSON(input)`；删除与顶点编辑会同步结果列表。
`useSceneSnapshot()` 提供异步 `capture()`、`restore(input, options?)`、`saveLocal(key?)`、`restoreLocal(key?, options?)`。
`useSelection()` 返回 `selected` / `hovered` 浅引用，以及异步 `select(payload | null)`、`clear()`、`setEnabled(enabled)`。

类型导出：`UseSceneSnapshotReturn`、`UseSelectionReturn`。
示例见[成果保存、场景快照与选择](../guide/persistence-selection.md)。
