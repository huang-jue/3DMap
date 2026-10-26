# @sgyx/cesium-kit-vue

`@sgyx/cesium-kit-core` 的 Vue 3 适配层：一个 `<CesiumViewer>` 组件 + 一组 composables。

## 安装

```bash
pnpm add cesium vue @sgyx/cesium-kit-core @sgyx/cesium-kit-vue
pnpm add -D @sgyx/cesium-kit-vite
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { cesiumAssets } from '@sgyx/cesium-kit-vite'

export default defineConfig({ plugins: [vue(), cesiumAssets()] })
```

入口需要引入两份样式，顺序不要颠倒：

```ts
import 'cesium/Build/Cesium/Widgets/widgets.css'
import '@sgyx/cesium-kit-vue/style.css'
```

## 最小示例

```vue
<script setup lang="ts">
import { CesiumViewer } from '@sgyx/cesium-kit-vue'
</script>

<template>
  <CesiumViewer
    style="height: 100vh"
    :options="{ ionToken: import.meta.env.VITE_CESIUM_ION_TOKEN, showCredits: false }"
    base-layer="naturalEarth"
    @camera-change="(view) => console.log(view)"
  />
</template>
```

## 全局安装（可选）

```ts
import { CesiumKit } from '@sgyx/cesium-kit-vue'

app.use(CesiumKit, {
  ionToken: import.meta.env.VITE_CESIUM_ION_TOKEN,
  defaultViewerOptions: { showCredits: false }
})
```

`CesiumKit` 只注入默认配置，不会创建 Viewer。

## 实体与标注

基础实体由 `@sgyx/cesium-kit-core` 的工厂创建，再交给 `useEntities()` 加入当前 Viewer：

```vue
<script setup lang="ts">
import { createLabel, createPoint } from '@sgyx/cesium-kit-core'
import { useEntities } from '@sgyx/cesium-kit-vue'

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

需要动态文本或其他工厂没有覆盖的 Cesium 属性时，可以手动创建 `Cesium.Entity`，
但仍通过 `add()` 管理，不要直接调用 `viewer.entities.add()`。

## `<CesiumViewer>` API

| Props | 类型 | 说明 |
| --- | --- | --- |
| `options` | `CesiumKitOptions` | 初始化选项，仅在首次挂载生效 |
| `ionToken` | `string` | 覆盖全局 token |
| `baseLayer` | `string` | 初始底图 id，变化时自动切换 |
| `sceneMode` | `'3D' \| '2D' \| 'COLUMBUS_VIEW'` | 初始投影，变化时自动切换 |
| `autoInit` | `boolean` | 默认 `true`，`false` 时可手动调用 `init()` |

| Events | 参数 |
| --- | --- |
| `ready` | `CesiumViewerManager` |
| `error` | `CesiumKitErrorPayload`（`source` / `error` / `detail`） |
| `camera-change` | `CameraView` |
| `imagery-change` | `string \| null` |
| `scene-mode` | `SceneModeName` |
| `update:baseLayer` | `string \| null`，支持 `v-model:base-layer` |
| `update:sceneMode` | `SceneModeName`，支持 `v-model:scene-mode` |
| `destroyed` | - |

| Expose | 说明 |
| --- | --- |
| `manager` | `CesiumViewerManager \| null` |
| `whenReady()` | `Promise<CesiumViewerManager>` |
| `init()` / `destroy()` | 手动初始化 / 销毁 |
| `getViewer()` | 同步获取 `Cesium.Viewer` |
| `flyHome(duration?)` | 复位视角 |
| `setSceneMode(mode, duration?)` | 切换投影 |
| `switchBaseLayer(id)` | 切换底图 |

默认插槽内容会叠加在地图之上，composables 依赖的 provide/inject 在插槽内可用。

## Composables

| API | 说明 |
| --- | --- |
| `useViewer()` | `manager` / `viewer` / `ready` / `error` / `whenReady()` / `getViewer()` |
| `useCamera({ track })` | 响应式 `view`，`flyTo` / `flyHome` / `setView` / `getView` |
| `useImagery()` | 响应式 `layers` / `active`，`add` / `switchTo` / `remove` / `setAlpha` / `setShow` |
| `useEntities()` | 响应式 `count`，`add` / `addMany` / `remove` / `clear` / `list` / `filter` |
| `useSceneMode()` | 响应式 `mode`，`setMode` / `getMode` |
| `useFeature(feature, options?)` | 组件挂载时注册插件，卸载时自动注销并回收图层 |
| `usePick({ hover, hoverInterval })` | `last` / `hovered` 拾取结果，`pickAt` / `setEnabled` |
| `useCameraShare()` | `getUrl` / `applyFromUrl` / `copyUrl` |
| `useClock()` | 时间轴 `state` 与播放/倍速/跳转控制 |

所有 composables 必须在 `<CesiumViewer>` 的插槽内调用，否则会抛出明确错误。
初始化期间调用会自动等待 `whenReady()`，无需自己处理时序。

## 业务插件示例

```vue
<script setup lang="ts">
import { markers } from './features/markers'
import { useFeature } from '@sgyx/cesium-kit-vue'

const { registered } = useFeature(markers, { cities: [{ name: '北京', lon: 116.39, lat: 39.9 }] })
</script>

<template>
  <CesiumViewer style="height: 100vh">
    <div v-if="registered" class="legend">标注已启用</div>
  </CesiumViewer>
</template>
```

## 注意事项

- 组件卸载时会先移除监听，再 `destroy()` Viewer（内部判断 `isDestroyed()`，可重复调用）。
- `options` 仅在首次挂载生效；后续调整请通过 `manager` 的命令式 API。
- SSR 场景下组件渲染为普通容器，初始化只发生在 `onMounted`。
