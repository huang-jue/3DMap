# @cesium-kit/vite

## `cesiumAssets(options?): Plugin[]`

```ts
import { cesiumAssets } from '@cesium-kit/vite'

export default defineConfig({
  plugins: [vue(), cesiumAssets()]
})
```

### 选项

| 名称 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `baseUrl` | `string` | `'cesium'` | 资源路径前缀 |
| `defineBaseUrl` | `boolean` | `true` | 注入 `CESIUM_BASE_URL` 编译期常量 |
| `runtimeBaseUrl` | `boolean` | `true` | 向 `index.html` 注入 `window.CESIUM_BASE_URL` |
| `root` | `string` | `process.cwd()` | Vite 根目录 |
| `stripBase` | `number` | 自动 | 资源路径裁剪层级，一般无需设置 |

### 行为

1. 从消费者项目的 `node_modules/cesium` 解析 Cesium 包位置（支持 pnpm 符号链接）。
2. 在构建与 dev 阶段把四个静态目录映射到 `baseUrl` 下。
3. 注入 `CESIUM_BASE_URL`，并在 HTML 头部写入 `window.CESIUM_BASE_URL` 作为兜底。
4. 找不到 `cesium` 或 `Build/Cesium` 时抛出可读错误。

### 常见配置

```ts
// 部署到子路径
cesiumAssets({ baseUrl: 'static/cesium' })

// 自行管理 baseUrl 时关闭注入
cesiumAssets({ defineBaseUrl: false, runtimeBaseUrl: false })
```

## 非 Vite 项目

参考 [常见问题 · 静态资源](/guide/faq#地图黑屏-控制台报-worker-404、assets-404)。
