# 绘制与量算

内核提供框架无关的 `DrawService`，支持点、线、面、矩形、圆与高差绘制，并在绘制过程中实时显示量算结果。

## 交互

- 点：单击完成。
- 线 / 面：左键加点，双击或右键结束；线至少 2 点，面至少 3 点。
- 矩形：两次单击确定对角点。
- 圆：第一次单击圆心，第二次单击确定半径。
- 高差：两次单击，显示高差与水平距离。
- `Esc` 取消当前绘制。
- 完成后自动生成黄色顶点句柄，拖拽即可编辑；再次按 `Esc` 隐藏句柄。

绘制期间会临时关闭 `PickService`，结束或取消后恢复，避免与业务点击冲突。

## 基础用法

```ts
const session = manager.draw.start('polyline', {
  editable: true,
  measure: { distance: true, segmentLabels: true },
  onUpdate(draft) {
    console.log(draft.positions, draft.measurement)
  },
  onComplete(result) {
    console.log(result.measurement.distance)
  }
})

// 取消当前绘制
manager.draw.cancel()

// 清空所有已完成绘制
manager.draw.clear()

// 销毁服务（Viewer 销毁时自动调用）
manager.draw.destroy()
```

`DrawType`：`'point' | 'polyline' | 'polygon' | 'rectangle' | 'circle' | 'height'`。

`DrawSession` 提供：

```ts
session.finish()
session.cancel()
session.remove()
session.setEditable(true)
session.updateVertex(0, { lon: 116.39, lat: 39.9 })
```

## 量算函数

量算也可以脱离绘制单独使用：

```ts
import {
  measureDistance,
  measureArea,
  measureHeight,
  measureCircle,
  measureRectangle,
  formatDistance,
  formatArea,
  formatHeight
} from '@sgyx/cesium-kit-core'

const distance = measureDistance([
  { lon: 116.39, lat: 39.9 },
  { lon: 121.47, lat: 31.23 }
])

const area = measureArea([
  { lon: 116.39, lat: 39.9 },
  { lon: 116.4, lat: 39.9 },
  { lon: 116.4, lat: 39.91 }
])

formatDistance(distance.distance)
formatArea(area.area)
formatHeight(measureHeight({ lon: 0, lat: 0, height: 10 }, { lon: 0, lat: 0, height: 25 }))
```

- 距离使用 WGS84 椭球测地线，逐段求和。
- 面积使用局部切平面上的多边形面积，适合城市级 / 区域级范围。
- 圆面积按球面小圆公式计算。
- 首版不做地形表面距离积分；跨半球或超大范围面积会有近似误差。

## 在插件中使用

`FeatureContext` 为每个插件提供独立的绘制服务，卸载时自动取消并回收实体：

```ts
export const floodDraw: CesiumFeature = {
  name: 'flood-draw',
  install(ctx) {
    const session = ctx.draw.start('polygon', {
      onComplete(result) {
        ctx.log.info('面积', result.measurement.area)
      }
    })
    ctx.layers.onDispose(() => session.remove())
  }
}
```

## Vue

```ts
import { useDraw } from '@sgyx/cesium-kit-vue'

const { active, drawing, results, start, cancel, clear } = useDraw()

await start('polygon', { editable: true })
```

`active` 为当前绘制 / 编辑会话，`results` 为已完成结果列表。
