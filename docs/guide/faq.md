# 常见问题

## 地图黑屏 / 控制台报 Worker 404、Assets 404

Cesium 的静态资源没有部署或 `CESIUM_BASE_URL` 不正确。

- Vite 项目：接入 `@cesium-kit/vite`，确认 `dist/cesium/Workers/` 存在。
- 非 Vite 项目：手动复制 `node_modules/cesium/Build/Cesium/{Workers,Assets,Widgets,ThirdParty}`，
  并设置 `window.CESIUM_BASE_URL` 或传入 `cesiumBaseUrl`。
- 部署到子路径时：`cesiumAssets({ baseUrl: 'static/cesium' })`。

## 提示 “Unrecognized frame destination” 或地形加载失败

`terrain: 'world'` 需要有效的 Cesium ion token：

```ts
const el = document.getElementById('map')!
await CesiumViewerManager.create(el, { ionToken: '...' })
```

## 为什么切换 2D 后视角不跳了

内核在 `morphComplete` 后会自动回写切换前的经纬高与姿态。如果你希望保留 Cesium 的默认行为，可绕过内核直接调用 `manager.viewer.scene.morphTo2D()`。

## 相机面板数值为 0

2D / 哥伦布视图下部分角度无意义，内核统一回退为 0。若需要地图中心坐标，请使用 `manager.coords.pickPosition()`。

## SSR 报错 `window is not defined`

- 库本身在顶层不访问 DOM，可以直接参与 SSR 构建。
- 初始化必须发生在浏览器：Vue 中由 `<CesiumViewer>` 自动在 `onMounted` 执行。
- 引入 `@cesium-kit/vue/style.css` 请交给构建工具处理（不要在 Node 里执行）。

## 多个地图实例

每个 `<CesiumViewer>` 或 `CesiumViewerManager.create` 都是独立实例，互不影响。卸载时务必调用 `destroy()`，组件会自动处理。

## 提示 “插件已注册” / “插件已卸载”

- `register` 同名插件会抛错，先 `unregister` 再注册。
- 卸载后插件内继续向 `ctx.layers` 登记对象会被忽略并告警，说明存在异步竞态，应在 `install` 中等待完成或检查卸载状态。

## 类型提示缺失

确认：
1. 安装的是 `@cesium-kit/*` 的正式版本而非源码目录；
2. `tsconfig.json` 的 `moduleResolution` 为 `bundler` 或 `node16`；
3. `cesium` 已安装（类型由 Cesium 包自带）。
