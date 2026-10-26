# 快速开始

## 安装

```bash
pnpm add cesium @sgyx/cesium-kit-core @sgyx/cesium-kit-vue
pnpm add -D @sgyx/cesium-kit-vite
```

## 配置 Vite

`@sgyx/cesium-kit-vite` 负责复制 Cesium 静态资源并注入 `CESIUM_BASE_URL`：

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { cesiumAssets } from '@sgyx/cesium-kit-vite'

export default defineConfig({
  plugins: [vue(), cesiumAssets()]
})
```

## 引入样式

```ts
// main.ts
import 'cesium/Build/Cesium/Widgets/widgets.css'
import '@sgyx/cesium-kit-vue/style.css'
```

## 渲染地图

```vue
<script setup lang="ts">
import { CesiumViewer } from '@sgyx/cesium-kit-vue'

const options = {
  ionToken: import.meta.env.VITE_CESIUM_ION_TOKEN,
  showCredits: false,
  homeView: { lon: 104, lat: 30, height: 12000000 }
}
</script>

<template>
  <div style="height: 100vh">
    <CesiumViewer :options="options" base-layer="naturalEarth" />
  </div>
</template>
```

## 不使用 Vue

```ts
import { CesiumViewerManager } from '@sgyx/cesium-kit-core'

const manager = await CesiumViewerManager.create(document.getElementById('map')!, {
  showCredits: false
})
manager.camera.flyTo({ lon: 116.39, lat: 39.9, height: 5000 })
```

## 下一步

- 了解 [Viewer 与能力](/guide/viewer)
- 编写第一个 [业务插件](/guide/feature)
- 遇到问题先看 [常见问题](/guide/faq)
