# Viewer 与能力

## 初始化选项

`CesiumViewerManager.create(container, options)` 的所有字段均可选：

| 选项 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `ionToken` | `string` | - | Cesium ion token |
| `cesiumBaseUrl` | `string` | - | 静态资源路径，使用 vite 插件时无需设置 |
| `viewerOptions` | `Viewer.ConstructorOptions` | - | 直接透传，优先级最高 |
| `animation` / `timeline` | `boolean` | `false` | 时间轴控件 |
| `geocoder` / `homeButton` / `sceneModePicker` | `boolean` | `false` | Cesium 内置控件 |
| `baseLayerPicker` / `navigationHelpButton` / `fullscreenButton` | `boolean` | `false` | Cesium 内置控件 |
| `infoBox` / `selectionIndicator` | `boolean` | `false` | 交互控件 |
| `showCredits` | `boolean` | `true` | 是否显示版权信息 |
| `enableLighting` | `boolean` | `false` | 地球光照 |
| `depthTestAgainstTerrain` | `boolean` | `true` | 地形深度测试 |
| `skyAtmosphere` / `fog` | `boolean` | `true` | 大气与雾 |
| `imagery` | `ImageryConfig[] \| false` | `naturalEarth` + `osm` | 初始底图 |
| `terrain` | `TerrainInput` | `'ellipsoid'` | `'ellipsoid'` / `'world'` / provider |
| `homeView` | `PositionInput \| BoundsInput \| null` | 中国全域 | 复位视角 |
| `camera` | `CameraServiceOptions` | - | 相机变化阈值等 |
| `requestRenderMode` | `boolean` | `false` | 按需渲染 |
| `logLevel` | `'silent' \| 'error' \| 'warn' \| 'info' \| 'debug'` | `'warn'` | 日志级别 |

## 底图

```ts
await manager.imagery.add('arcgis', { id: 'satellite', show: false })
manager.imagery.switchTo('satellite')
manager.imagery.setAlpha('satellite', 0.8)
manager.imagery.remove('osm')
```

自定义瓦片：

```ts
import { createXyzImagery } from '@cesium-kit/core'

await manager.imagery.add(createXyzImagery('https://tile.example.com/{z}/{x}/{y}.png'), {
  id: 'custom'
})
```

## 地形

```ts
import * as Cesium from 'cesium'

await manager.terrain.set('world')      // 需要有效 ion token
const provider = new Cesium.EllipsoidTerrainProvider() // 替换成你的 TerrainProvider
await manager.terrain.set(provider)
manager.terrain.reset()
```

## 相机

```ts
manager.camera.flyTo({ lon: 116.39, lat: 39.9, height: 5000 }, { duration: 2, pitch: -45 })
manager.camera.setView({ west: 100, south: 20, east: 110, north: 30 }) // 矩形范围
manager.camera.flyHome()

const view = manager.camera.getView() // { lon, lat, height, heading, pitch, roll }，角度为度

const stop = manager.camera.onChange((view) => {
  console.log(view.lon, view.lat)
})
stop()
```

相机事件基于 `camera.changed` 与 `percentageChanged`（默认 0.01），不存在定时轮询。

### 视角约束

```ts
manager.camera.setConstraints({
  minHeight: 200,          // 最低高度（米）
  maxHeight: 8000000,      // 最高高度（米）
  minPitch: -60,           // 最小俯仰角（度），越小越接近垂直俯视
  maxPitch: -20            // 最大俯仰角（度）
})
manager.camera.setCollisionDetection(true)
```

低于 `minHeight` 或超出俯仰范围时会在 `camera.changed` 中自动夹取。

### 视角分享

```ts
const url = manager.camera.getShareUrl(location.href)
// https://your.app/#map=116.3913,39.9075,5000,0,-45,0

manager.camera.applyFromUrl(location.href) // 成功返回 true
```

## 拾取

```ts
manager.pick.on('click', ({ lonLatHeight, entity, screen }) => {
  console.log(lonLatHeight.lon, lonLatHeight.lat, entity?.name)
})
manager.pick.on('hover', (payload) => {})
manager.pick.setHoverInterval(120) // 默认 80ms
manager.pick.setEnabled(false)

const result = manager.pick.pickAt() // 手动拾取画布中心
```

3D / 2D / 哥伦布视图行为一致，内部自动选择拾取方式；事件处理器由内核统一销毁，插件可直接使用 `ctx.pick`。

## 截图

```ts
// 创建时开启
const el = document.getElementById('map')!
const manager = await CesiumViewerManager.create(el, { preserveDrawingBuffer: true })

const { dataUrl, blob } = manager.scene.screenshot({ type: 'image/png' })
```

未开启 `preserveDrawingBuffer` 时调用会抛出带修复提示的错误。

## 场景视觉

```ts
manager.scene.setSkyBox(false)      // 天空盒与星空
manager.scene.setSun(false)
manager.scene.setMoon(false)
manager.scene.setSkyAtmosphere(false)
manager.scene.setGlobeVisible(false)
manager.scene.setBaseColor('#0b1020')
```

## 资产自检

```ts
import { verifyCesiumAssets } from '@cesium-kit/core'

const result = await verifyCesiumAssets()
// { ok, baseUrl, checks: [{ name, url, ok, status }] }
```

也可在创建时开启 `verifyAssets: true`，失败会通过 `error` 事件（`source: 'assets'`）上报。

## 投影

```ts
manager.scene.setMode('2D')
manager.scene.setMode('COLUMBUS_VIEW', 0) // 立即切换
```

Cesium 在 morph 后会丢失原视角，内核会在 `morphComplete` 后自动回写，保证切换前后视野一致。

## 实体

```ts
import { createLabel, createPoint, createPolygon } from '@cesium-kit/core'

const positions = [
  { lon: 116.38, lat: 39.89 },
  { lon: 116.42, lat: 39.89 },
  { lon: 116.42, lat: 39.92 },
  { lon: 116.38, lat: 39.92 }
]

const point = manager.entities.add(
  createPoint({ position: { lon: 116.39, lat: 39.9 }, clampToGround: true, color: '#409eff' })
)
manager.entities.add(
  createLabel({
    position: { lon: 116.39, lat: 39.9, height: 30 },
    text: '北京',
    fillColor: '#ffffff',
    outlineColor: '#111827',
    pixelOffset: [0, -14],
    clampToGround: true
  })
)
manager.entities.add(createPolygon({ positions, extrudedHeight: 500 }))

manager.entities.remove(point.id)
manager.entities.clear()
```

## 坐标

```ts
const cartesian = manager.coords.toCartesian(116.39, 39.9, 100)
const { lon, lat, height } = manager.coords.toDegrees(cartesian)
const screen = manager.coords.toScreen(cartesian)        // { x, y, visible }
const picked = manager.coords.pickPosition()             // 屏幕中心拾取
const ground = manager.coords.sampleHeight({ lon, lat })
```

## 事件

```ts
manager.events.on('ready', (manager) => {})
manager.events.on('error', ({ source, error, detail }) => {}) // viewer/imagery/terrain/...
manager.events.on('camera:change', (view) => {})
manager.events.on('imagery:change', ({ id }) => {})
manager.events.on('imagery:update', ({ id }) => {})      // 透明度等属性变化
manager.events.on('scene:mode', (mode) => {})
manager.events.on('feature:registered', (name) => {})
manager.events.on('feature:error', ({ name, error }) => {})
```

## 销毁

```ts
manager.destroy() // 幂等；会先卸载插件、移除监听，再销毁 Viewer
```
