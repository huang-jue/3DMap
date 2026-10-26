# 天气预报

`@sgyx/cesium-kit-weather` 是可选插件包，提供多种天气栅格图层、时间轴联动、图例和透明度控制。

首期支持：

- 降水、雷达回波、温度、云量、湿度、气压
- 网格数据色带渲染
- 图片帧
- 多时刻数据跟随 `ClockService`
- 可选时间范围
- 图层独立显隐与透明度
- 城市/点预报与气象预警
- 隐藏图层懒加载、单图层失败隔离
- 跨帧淡入淡出与下一帧预加载
- 天气图层可接入统一图层树

不需要天气能力的项目不安装该包即可。

## 安装

```bash
pnpm add @sgyx/cesium-kit-weather
```

## 启用多图层

```ts
import { createWeatherPlugin } from '@sgyx/cesium-kit-weather'

const weather = createWeatherPlugin({
  layers: [
    {
      kind: 'precip',
      data: '/data/weather/precip.json',
      visible: true,
      alpha: 0.78
    },
    {
      kind: 'temperature',
      data: '/data/weather/temperature.json',
      visible: false
    }
  ],
  points: {
    points: '/data/weather/cities.json',
    visible: false
  },
  warnings: {
    warnings: '/data/weather/warnings.geojson',
    visible: false
  },
  followClock: true,
  syncClockRange: true,
  lazy: true,
  continueOnError: true,
  onLayerError: (key, error) => console.warn(key, error)
})

await manager.features.register(weather)
```

运行中控制图层：

```ts
weather.setLayerVisible('precip', true)
weather.setLayerAlpha('precip', 0.6)
weather.setTimeRange(new Date('2026-07-01T00:00:00Z'), new Date('2026-07-02T00:00:00Z'))
weather.setTime(new Date('2026-07-01T06:00:00Z'))
```

## 单独使用一个图层

```ts
import { createWeatherRasterFeature } from '@sgyx/cesium-kit-weather'

const precip = createWeatherRasterFeature({
  kind: 'precip',
  data: '/data/weather/precip.json',
  followClock: true,
  syncClockRange: true,
  flyTo: true
})

await manager.features.register(precip)
```

## 数据格式

### 网格帧

```json
{
  "kind": "precip",
  "name": "降水",
  "unit": "mm/h",
  "legend": {
    "min": 0,
    "max": 30,
    "colors": [
      "rgba(255,255,255,0)",
      "#38bdf8",
      "#22d3ee",
      "#34d399",
      "#facc15",
      "#f97316",
      "#ef4444"
    ]
  },
  "frames": [
    {
      "time": "2026-07-01T00:00:00Z",
      "bounds": { "west": 100, "south": 20, "east": 130, "north": 40 },
      "width": 2,
      "height": 2,
      "noData": -999,
      "values": [0, 0.4, 1.2, -999]
    }
  ]
}
```

规则：

- `values` 按行优先存储
- 第 0 行是南侧，第 0 列是西侧
- `noData` 对应像素透明
- 色带用 CSS 颜色，支持 `rgba()`
- 也可以用 `scale: 'log'` 做对数色带

### 图片帧

```json
{
  "kind": "radar",
  "frames": [
    {
      "time": "2026-07-01T00:00:00Z",
      "bounds": { "west": 100, "south": 20, "east": 130, "north": 40 },
      "width": 1024,
      "height": 512,
      "imageUrl": "/data/weather/radar/2026070100.png"
    }
  ]
}
```

图片帧直接作为单幅底图叠加，适合后端已经渲染好的雷达图。建议显式提供 `width/height`；未提供时会读取图片原始尺寸，读取失败则回退到 `1024x512`。

### 多图层数据集

```json
{
  "name": "长江流域预报",
  "layers": [
    { "kind": "precip", "frames": [] },
    { "kind": "temperature", "frames": [] }
  ]
}
```

`parseWeatherDataset` / `loadWeatherDataset` 可以直接解析这种格式。

## 时间范围

`timeRange` 可以限制图层只使用某一段预报时间：

```ts
createWeatherRasterFeature({
  kind: 'precip',
  data: '/data/weather/precip.json',
  timeRange: ['2026-07-01T00:00:00Z', '2026-07-01T12:00:00Z'],
  syncClockRange: true
})
```

运行中修改：

```ts
weather.setTimeRange(start, end)
const range = weather.getTimeRange()
const available = weather.getAvailableRange()
```

`syncClockRange: true` 时会把 `ClockService` 的范围同步为图层时间范围。

面板和示例统一使用**本地时间**显示；数据文件中的 `time` 仍建议使用 UTC ISO 字符串。

## 点预报

```ts
import { createWeatherPointFeature } from '@sgyx/cesium-kit-weather'

const points = createWeatherPointFeature({
  points: '/data/weather/cities.json',
  showPopup: true,
  onSelect: (point) => console.log(point)
})
```

点击城市点会打开内置轻量弹窗；`onSelect` 可用于宿主自定义侧边栏。点数据格式：

```json
{
  "points": [
    {
      "id": "wuhan",
      "name": "武汉",
      "lon": 114.3,
      "lat": 30.6,
      "hourly": [
        {
          "time": "2026-07-01T00:00:00Z",
          "temperature": 30,
          "precipitation": 1.2,
          "humidity": 78,
          "windSpeed": 4.5,
          "windDirection": 120,
          "text": "多云"
        }
      ]
    }
  ]
}
```

## 气象预警

```ts
import { createWeatherWarningFeature } from '@sgyx/cesium-kit-weather'

const warnings = createWeatherWarningFeature({
  warnings: '/data/weather/warnings.geojson',
  showPopup: true
})
```

预警使用 GeoJSON `FeatureCollection`，`properties` 支持 `id / type / level / title / description / startTime / endTime`，几何支持 `Polygon` 和 `MultiPolygon`。预警会按当前 `ClockService` 时间自动显隐。

## 懒加载与错误隔离

- `lazy: true`：默认只加载 `visible: true` 的图层，打开隐藏图层时再加载
- `continueOnError: true`：单个图层失败不影响其他图层
- `onLayerError(key, error)`：接收失败图层
- `onLayerLoaded(key)`：接收加载成功图层
- `errors`：读取当前错误集合

## 回调与刷新

```ts
const weather = createWeatherPlugin({
  layers: [/* ... */],
  onFrameChange: (kind, frame) => console.log(kind, frame.time),
  onTimeRangeChange: (range) => console.log(range)
})

await weather.refresh()
await weather.updateLayerData('precip', '/data/weather/precip-latest.json')
weather.setFollowClock(false)
weather.setPointsVisible(true)
weather.setWarningsVisible(true)
```

## 图层树

存在 `ctx.layerManager` 时，天气图层会自动挂到“天气图层”分组下，节点类型为 `custom`。面板和图层树都可以控制显隐、透明度和顺序。

自定义图层不参与场景快照，需要插件或宿主自行恢复。

## 渲染与性能

- 天气图层直接操作 `viewer.imageryLayers`，不进入 `ImageryManager`，避免影响底图 active 状态
- 帧切换只在最近帧索引变化时发生
- Canvas 结果会按帧缓存
- 默认开启跨帧淡入淡出，可通过 `crossfade: false` 关闭
- `preload` 控制预加载后续帧数量，默认 1
- 大网格建议后端降采样或转换为图片帧
- 首期不解析 GRIB/NetCDF，也不直连第三方天气 API

## 静态样例

playground 提供 `apps/playground/public/data/weather/` 静态样例：

```text
manifest.json
precip.json
radar.json
temperature.json
cloud.json
humidity.json
cities.json
warnings.geojson
```

可用以下命令重新生成：

```bash
node scripts/generate-weather-samples.mjs
```
