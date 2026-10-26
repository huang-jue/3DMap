# @cesium-kit/core

Cesium 基础能力内核：Viewer 生命周期、底图、地形、相机、场景模式、实体、坐标转换、事件总线，以及业务插件注册表。

- 纯 TypeScript，无 Vue / React 依赖
- 零顶层 DOM 访问，可安全参与 SSR 构建（运行时需在浏览器中调用）
- `cesium` 为 `peerDependency`

## 安装

```bash
pnpm add cesium @cesium-kit/core
```

Cesium 的静态资源（Workers/Assets/Widgets）需要被复制到可访问路径。使用 Vite 时推荐配合 [`@cesium-kit/vite`](../vite)：

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { cesiumAssets } from '@cesium-kit/vite'

export default defineConfig({ plugins: [cesiumAssets()] })
```

非 Vite 项目需自行复制 `node_modules/cesium/Build/Cesium/{Workers,Assets,Widgets,ThirdParty}`
并保证运行时 `CESIUM_BASE_URL`（或 `cesiumBaseUrl` 选项）指向该目录。

## 快速开始

```ts
import { CesiumViewerManager, createLabel, createPoint } from '@cesium-kit/core'

const manager = await CesiumViewerManager.create(document.getElementById('map')!, {
  ionToken: import.meta.env.VITE_CESIUM_ION_TOKEN,
  showCredits: false,
  imagery: [
    { source: 'naturalEarth', id: 'naturalEarth', show: true },
    { source: 'osm', id: 'osm', show: false }
  ],
  homeView: { lon: 104, lat: 30, height: 12000000 }
})

manager.imagery.switchTo('osm')
manager.scene.setMode('2D')
manager.camera.flyTo({ lon: 116.39, lat: 39.9, height: 5000 })
manager.entities.add(createPoint({ position: { lon: 116.39, lat: 39.9 }, clampToGround: true }))
manager.entities.add(createLabel({
  position: { lon: 116.39, lat: 39.9, height: 30 },
  text: '北京',
  pixelOffset: [0, -14],
  clampToGround: true
}))

// 卸载
manager.destroy()
```

## 能力清单

| 成员 | 说明 |
| --- | --- |
| `manager.imagery` | 底图增删、切换、透明度、显隐；内置 `naturalEarth` / `osm` / `arcgis` 预设 |
| `manager.terrain` | `'ellipsoid'` / `'world'` / 自定义 `TerrainProvider` |
| `manager.camera` | `flyTo` / `setView` / `flyHome` / `getView` / 变化订阅（基于 `camera.changed`，无轮询） |
| `manager.scene` | 3D/2D/哥伦布切换（切换后自动还原视角）、光照、雾、按需渲染 |
| `manager.entities` | 实体增删查，配合 `createPoint/createLabel/createPolyline/createPolygon/createModel` |
| `manager.coords` | `toCartesian` / `toDegrees` / `toScreen` / `pickPosition` / `sampleHeight`（2D/3D 均可用） |
| `manager.events` | 类型安全事件总线：`ready`、`error`、`camera:change`、`imagery:change`、`imagery:update`、`scene:mode`、`feature:*` |
| `manager.features` | 业务插件注册表（见下） |
| `manager.pick` | 点击/悬停拾取（2D/3D 一致），无命中时返回 undefined |
| `manager.clock` | 时间轴：播放/暂停/倍速/范围/跳转/帧驱动 |
| `manager.dataSources` | GeoJSON / CZML / KML 加载、样式、定位 |
| `manager.tilesets` | 3D Tiles 加载、样式、显隐、定位 |
| `manager.scene.screenshot()` | 导出 PNG（需 `preserveDrawingBuffer: true`） |

## 业务插件

插件是后续业务能力（如洪水演进）的唯一扩展点，内核不感知任何业务概念。

```ts
import { createPoint, type CesiumFeature } from '@cesium-kit/core'

export const markers: CesiumFeature<{ cities: Array<{ name: string; lon: number; lat: number }> }> = {
  name: 'markers',
  install(ctx, options) {
    options.cities.forEach((city) => {
      ctx.layers.add(createPoint({ position: city, name: city.name, clampToGround: true }))
    })
  }
}

await manager.features.register(markers, { cities: [{ name: '北京', lon: 116.39, lat: 39.9 }] })
manager.features.unregister('markers') // 该插件登记的实体/底图/回调会被统一回收
```

约定：

- 插件创建的所有 Cesium 对象通过 `ctx.layers` 登记，禁止直接 `viewer.entities.add`。
- 自定义 Primitive 使用 `ctx.layers.primitive(primitive)` 登记，卸载时由内核移除并销毁。
- `install` 可以是 async；卸载发生在安装过程中时，内核会自动回滚。
- `dispose` 必须同步且幂等。
- 插件之间通过 `ctx.events` 通信，不要互相引用。

## 坐标系与角度

- 对外经纬度与相机角度统一使用**度**，内部转换为弧度。
- 2D / 哥伦布视图下无意义的角度统一回退为 0。
- `pickPosition` 会自动选择拾取方式：3D 深度拾取 → 3D 射线求交 → 2D/CV 椭球拾取，返回值中的 `source` 标明实际路径。

## 错误处理

```ts
manager.events.on('error', ({ source, error, detail }) => {
  // source: 'viewer' | 'imagery' | 'terrain' | 'camera' | 'scene' | 'feature' | 'assets'
  console.error(source, error, detail)
})
```

底图、地形等运行期失败不再复用 `feature:error`，插件自身的错误仍通过 `feature:error` 派发。

## 日志

```ts
import { setLogLevel } from '@cesium-kit/core'
setLogLevel('debug')
```

也可通过 `CesiumViewerManager.create(container, { logLevel: 'debug' })` 设置。
