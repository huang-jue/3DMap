# 业务插件开发

内核只提供地图能力。**任何业务能力（洪水演进、淹没分析、轨迹回放…）都以插件形式接入**，判断标准是：内核代码里不应出现具体业务名词。

## 契约

```ts
import type * as Cesium from 'cesium'

export interface FeatureContext {
  viewer: Cesium.Viewer
  /** 时间轴服务（0.2.0 起，可通过 .raw 拿原生 Clock） */
  clock: ClockService
  /** clock 的别名 */
  time: ClockService
  coords: CoordService
  events: EventBus<CesiumKitEventMap>
  layers: FeatureLayerRegistry
  pick: PickService
  /** 插件作用域绘制服务，卸载时自动取消并回收实体 */
  draw: DrawService
  /** 插件作用域弹窗服务，卸载时自动关闭 */
  popup: PopupScope
  log: Logger
}

`FeatureLayerRegistry` 提供 `add / addMany / remove / removeById / imagery / dataSource / tileset / primitive / onDispose`。自定义 Primitive（风场、后处理等）必须通过 `ctx.layers.primitive()` 登记。

export interface CesiumFeature<T = unknown> {
  name: string
  install(ctx: FeatureContext, options: T): void | Promise<void>
  dispose?(): void
}
```

## 示例

```ts
import { createLabel, createPoint, type CesiumFeature } from '@cesium-kit/core'

interface Options {
  cities: Array<{ name: string; lon: number; lat: number }>
}

export const cityMarkers: CesiumFeature<Options> = {
  name: 'city-markers',
  install(ctx, options) {
    options.cities.forEach((city) => {
      ctx.layers.add(
        createPoint({
          position: { lon: city.lon, lat: city.lat },
          clampToGround: true,
          color: '#67c23a'
        })
      )
      ctx.layers.add(
        createLabel({
          position: { lon: city.lon, lat: city.lat },
          text: city.name,
          clampToGround: true,
          pixelOffset: [0, -14]
        })
      )
    })

    // 非 Cesium 对象的清理也要登记
    const timer = setInterval(() => ctx.log.debug('tick'), 1000)
    ctx.layers.onDispose(() => clearInterval(timer))
  },
  dispose() {
    // 这里只做插件自身状态清理，图层由内核统一回收
  }
}
```

注册与卸载：

```ts
const cities = [
  { name: '北京', lon: 116.39, lat: 39.9 },
  { name: '上海', lon: 121.47, lat: 31.23 }
]

await manager.features.register(cityMarkers, { cities })
manager.features.unregister('city-markers')
```

Vue 中自动跟随组件生命周期：

```ts
import { useFeature } from '@cesium-kit/vue'

const cities = [
  { name: '北京', lon: 116.39, lat: 39.9 },
  { name: '上海', lon: 121.47, lat: 31.23 }
]

useFeature(cityMarkers, { cities })
```

## 规则

1. **所有 Cesium 对象必须通过 `ctx.layers` 登记**，否则卸载时会泄漏。
2. `install` 可以是 async。若安装尚未完成就发生卸载，内核会等待安装结束后回滚，期间新登记的对象会被忽略并给出告警。
3. `dispose` 必须同步且幂等，只清理插件自身状态。
4. 插件之间通过 `ctx.events` 通信，不要互相 import。
5. 需要时序能力时使用 `ctx.clock`，不要自己起定时器驱动渲染。

## 为什么这样设计

- 内核稳定、插件独立发版，Cesium 升级只需验证内核。
- 插件可懒加载，首屏不必带上全部业务代码。
- 卸载路径统一，避免 `viewer.entities` 越用越多这类线上问题。
