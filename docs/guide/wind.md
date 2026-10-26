# 风场

`@cesium-kit/wind` 是可选插件包，包含两部分：

- **气象风场**：基于 `cesium-wind-layer` 的 GPU 粒子流，支持 U/V 网格、色带、地形遮挡。
- **风电场**：Billboard + Label 展示风机，支持状态色、功率/风速时间序列、点击选中。

不需要风场的项目不安装该包即可，内核不受影响。

## 安装

```bash
pnpm add @cesium-kit/wind
```

## 启用气象风场

```ts
import { createWindFieldFeature } from '@cesium-kit/wind'

const windField = createWindFieldFeature({
  data: '/data/wind.json',
  particlesTextureSize: 96,
  speedFactor: 1.5,
  particleHeight: 50000,
  lineWidth: { min: 1, max: 2 },
  lineLength: { min: 60, max: 160 },
  colors: ['#ffffff'],
  showSpeedOverlay: true,
  speedOverlayAlpha: 0.78,
  flyTo: true
})

await manager.features.register(windField)
manager.features.unregister('wind-field')
```

运行中调整参数：

```ts
windField.updateOptions({ speedFactor: 1.5, dynamic: false })
windField.setVisible(false)
const sample = windField.getDataAtLonLat(116.39, 39.9)
// { u, v, speed, direction }，direction 为风去向（0° 北，90° 东）
```

## 数据格式

### 原生格式

```json
{
  "u": [0, 1, 2, 3],
  "v": [0, 1, 2, 3],
  "width": 2,
  "height": 2,
  "bounds": { "west": 100, "south": 20, "east": 120, "north": 30 },
  "refTime": "2026-07-01T00:00:00Z"
}
```

数组按行优先存储，第 0 行是南侧。若数据是北到南，传入：

```ts
createWindFieldFeature({
  data: grid,
  parse: { rowOrder: 'north' }
})
```

### GFS / Windy 格式

```json
{
  "header": { "lo1": 0, "la1": 90, "la2": -90, "dx": 0.25, "dy": 0.25, "nx": 1440, "ny": 721 },
  "data": [
    { "header": { "parameterNumber": 2 }, "data": [/* u */] },
    { "header": { "parameterNumber": 3 }, "data": [/* v */] }
  ]
}
```

解析器会自动：

- 识别 `parameterNumber` 2/3 为 u/v
- 把北到南的数据翻转为南到北
- 把 0~360 经度滚动到 -180~180
- 读取 `refTime` + `forecastTime`

### 多时刻

传入 `WindGrid[]`，并让插件跟随 `ClockService`：

```ts
createWindFieldFeature({
  data: grids, // 每项带 refTime
  followClock: true
})
```

插件会在时间切片变化时调用 `updateWindData`，不会每帧重建纹理。

## 启用风电场

```ts
import { createWindFarmFeature } from '@cesium-kit/wind/farm'

const windFarm = createWindFarmFeature({
  turbines: '/data/turbines.json',
  label: { fields: ['name', 'power'] },
  onSelect: (turbine) => {
    console.log('选中风机', turbine)
  }
})

await manager.features.register(windFarm)
```

风机数据：

```json
{
  "turbines": [
    {
      "id": "wt-01",
      "name": "风机 01",
      "lon": 116.2,
      "lat": 39.8,
      "height": 90,
      "status": "running",
      "capacity": 2000,
      "power": [
        { "time": "2026-07-01T00:00:00Z", "value": 1200 },
        { "time": "2026-07-01T02:00:00Z", "value": 1600 }
      ]
    }
  ]
}
```

- `power` / `windSpeed` / `windDirection` 可以是静态数字，也可以是时间序列。
- `status` 支持 `running` / `stopped` / `maintenance` / `fault`。
- 点击风机触发 `onSelect`，点击空白处触发 `onSelect(null)`。

## 按配置组合

```ts
import { createWindPlugin } from '@cesium-kit/wind'

const plugin = createWindPlugin({
  field: { data: '/data/wind.json' },
  farm: { turbines: '/data/turbines.json' }
})

await manager.features.register(plugin)
```

只想启用风电场：

```ts
createWindPlugin({
  field: false,
  farm: { turbines: '/data/turbines.json' }
})
```

同时启用时，风电场会自动读取气象风场插值结果，在风机标签中显示实时风速。

## 注意

- `cesium-wind-layer` 使用 Cesium 私有渲染 API，升级 Cesium 后需要回归测试；建议锁定 Cesium 版本。
- 粒子动画需要持续渲染。插件激活时会暂时关闭 `requestRenderMode`，卸载后恢复。
- Vite 项目建议对 Cesium 去重，避免出现多份 `@cesium/engine`：

```ts
export default defineConfig({
  resolve: {
    dedupe: ['cesium', '@cesium/engine', '@cesium/widgets']
  }
})
```

- 大数据网格建议在 Worker 中解析，或由后端转换为 U/V JSON。
- 若风场看起来像零散噪点，优先增大 `particleHeight`（建议 30000～50000）和 `lineLength`（建议 300～900），并使用白色半透明粒子；过小的线长在缩放到全域时会退化成点。
- 气象风场的 `WindFieldLayer` 是自定义 Primitive 句柄，通过 `ctx.layers.primitive` 登记，卸载时由内核回收。
