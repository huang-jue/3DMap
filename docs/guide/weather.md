# 天气预报

`@cesium-kit/weather` 是可选插件包，提供多种天气栅格图层、时间轴联动、图例和透明度控制。

首期支持：

- 降水、雷达回波、温度、云量、湿度、气压
- 网格数据色带渲染
- 图片帧
- 多时刻数据跟随 `ClockService`
- 可选时间范围
- 图层独立显隐与透明度

不需要天气能力的项目不安装该包即可。

## 安装

```bash
pnpm add @cesium-kit/weather
```

## 启用多图层

```ts
import { createWeatherPlugin } from '@cesium-kit/weather'

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
  followClock: true,
  syncClockRange: true
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
import { createWeatherRasterFeature } from '@cesium-kit/weather'

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
    "colors": ["rgba(255,255,255,0)", "#38bdf8", "#22d3ee", "#34d399", "#facc15", "#f97316", "#ef4444"]
  },
  "frames": [
    {
      "time": "2026-07-01T00:00:00Z",
      "bounds": { "west": 100, "south": 20, "east": 130, "north": 40 },
      "width": 48,
      "height": 32,
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
      "imageUrl": "/data/weather/radar/2026070100.png"
    }
  ]
}
```

图片帧直接作为单幅底图叠加，适合后端已经渲染好的雷达图。

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

## 渲染与性能

- 天气图层直接操作 `viewer.imageryLayers`，不进入 `ImageryManager`，避免影响底图 active 状态
- 帧切换只在最近帧索引变化时发生
- Canvas 结果会按帧缓存
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
