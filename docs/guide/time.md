# 时间轴

`ClockService` 统一了 Cesium `Clock` 的播放、暂停、倍速、跳转与帧驱动，是洪水演进等时序业务的基础。

## 基础用法

```ts
manager.clock.setRange(new Date('2026-07-01'), new Date('2026-07-10'))
manager.clock.seek(new Date('2026-07-01'))
manager.clock.setMultiplier(21600) // 6 小时 / 秒
manager.clock.loop(true)
manager.clock.play()

manager.clock.onTick(({ currentTime }) => {
  // 每帧触发，用于更新水位面、粒子、动画等
})
```

| 方法 | 说明 |
| --- | --- |
| `play()` / `pause()` / `toggle()` | 播放控制 |
| `setMultiplier(n)` | 时间倍速，非法值会被忽略 |
| `setRange(start, stop)` / `clearRange()` | 时间范围 |
| `loop(enabled)` | 到达结束时间后循环 |
| `seek(date \| iso \| JulianDate)` | 跳转 |
| `stepForward()` / `stepBackward()` | 按 `setStep(seconds)` 前后跳转 |
| `onTick(cb)` | 帧驱动，返回取消订阅函数 |
| `onStateChange(cb)` | 播放状态/倍速变化 |
| `state` / `raw` | 只读状态 / 原生 `Cesium.Clock` |

事件：`clock:tick`、`clock:state`。

## 在插件中使用

0.2.0 起 `ctx.clock` 为 `ClockService`（不再是 `Cesium.Clock`），同时提供 `ctx.time` 别名：

```ts
import * as Cesium from 'cesium'
import type { CesiumFeature } from '@cesium-kit/core'

export const waterLevel: CesiumFeature = {
  name: 'water-level',
  install(ctx) {
    const start = new Date('2026-07-01T00:00:00Z')
    const end = new Date('2026-07-10T00:00:00Z')
    ctx.clock.setRange(start, end)
    ctx.clock.seek(start)
    ctx.clock.setMultiplier(21600)
    ctx.clock.play()

    const positions = Cesium.Cartesian3.fromDegreesArray([
      112.6, 30.2,
      114.4, 30.2,
      114.6, 31.0,
      112.8, 31.1
    ])

    ctx.layers.add(
      new Cesium.Entity({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(positions),
          extrudedHeight: new Cesium.CallbackProperty(() => {
            const t = ctx.clock.state.currentTime.getTime()
            return 10 + ((t - start.getTime()) / (end.getTime() - start.getTime())) * 180
          }, false)
        }
      })
    )

    ctx.layers.onDispose(() => ctx.clock.pause())
  }
}
```

playground 中的「水位演进演示」就是这段代码的可运行版本。

## 注意

- 时间驱动依赖 Cesium 的渲染循环，`requestRenderMode: true` 时需要自行调用 `scene.requestRender()` 或在插件里保持渲染。
- 需要原生 `Cesium.Clock` 时使用 `manager.clock.raw`。
