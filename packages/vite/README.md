# @cesium-kit/vite

为 Vite 项目自动完成 Cesium 的两件必做事项：

1. 复制 `cesium/Build/Cesium/{Workers,Assets,Widgets,ThirdParty}` 到产物目录；
2. 注入 `CESIUM_BASE_URL`，让 `buildModuleUrl` 能找到静态资源。

这是 “地图黑屏 / Worker 404 / Assets 404” 最常见的原因，插件把这一步收敛为一行配置。

## 安装

```bash
pnpm add cesium
pnpm add -D @cesium-kit/vite
```

## 使用

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { cesiumAssets } from '@cesium-kit/vite'

export default defineConfig({
  plugins: [vue(), cesiumAssets()]
})
```

构建后资源位于 `dist/cesium/**`，运行时通过 `/cesium/...` 访问。

## 选项

| 选项 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `baseUrl` | `string` | `'cesium'` | 资源部署路径，对应 `@cesium-kit/core` 的 `cesiumBaseUrl` |
| `defineBaseUrl` | `boolean` | `true` | 是否通过 `define` 注入 `CESIUM_BASE_URL` |
| `runtimeBaseUrl` | `boolean` | `true` | 是否在 `index.html` 中写入 `window.CESIUM_BASE_URL` |
| `root` | `string` | `process.cwd()` | Vite 项目根目录；若配置里改过 `root` 需手动指定 |
| `stripBase` | `number` | 自动计算 | 资源路径裁剪层级，一般无需设置 |

部署到子路径时：

```ts
cesiumAssets({ baseUrl: 'static/cesium' })
```

## Webpack 项目

插件不适用于 Webpack，请使用 `copy-webpack-plugin` 并配合环境变量：

```js
new CopyWebpackPlugin({
  patterns: [
    { from: 'node_modules/cesium/Build/Cesium/Workers', to: 'cesium/Workers' },
    { from: 'node_modules/cesium/Build/Cesium/Assets', to: 'cesium/Assets' },
    { from: 'node_modules/cesium/Build/Cesium/Widgets', to: 'cesium/Widgets' },
    { from: 'node_modules/cesium/Build/Cesium/ThirdParty', to: 'cesium/ThirdParty' }
  ]
})
```

```js
// webpack.config.js
new webpack.DefinePlugin({
  CESIUM_BASE_URL: JSON.stringify('/cesium')
})
```

或在使用 `@cesium-kit/core` 时直接传 `cesiumBaseUrl: '/cesium'`。
