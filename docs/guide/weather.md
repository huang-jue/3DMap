# 天气预报

`@sgyx/cesium-kit-weather` 是可选插件包，提供多种天气栅格图层、时间轴联动、图例和透明度控制。

> playground 中原“天气预报”面板已并入“地球模式”的叠加层与业务图层；本包仍可作为独立插件使用。

## 地图选点降雨预报

普通工作台展开“降雨预报”，点击“地图选点降雨预报”后在地图上选择位置。地球模式先点击地图固定点位，再点击点查卡片的“降雨预报”。预报与变量分析可切换，Escape 关闭并恢复焦点。悬停不会请求天气服务。

在线模式使用 Open-Meteo，默认查看从当前真实时间之后第一个完整小时时刻起的 48 个小时区间。时间显示 UTC+8；雨量柱表示该时刻结束的前一小时累计，单位 mm。雨量为 rain 与 showers 之和，任一缺测时保留空值；降水总量（含雨雪）和降雪量（cm）在明细中分别展示。概率采用服务原值，零概率保留为 0，缺测不推算。

“预计有雨时段”依据小时雨量 ≥0.1 mm 汇总，表示小时区间；不提供分钟级开始／停止判断或官方预警。48 小时雨量完整时显示完整累计，否则仅显示已知时段累计。数据不足时如实显示实际范围，缺测不按零处理。

在线点预报独立于地图时钟。地球地图已有的“3 小时累积降水”仍是离线快照，不会随着在线点预报刷新；请分别查看来源及有效时次。接口的获取时间不是预报发布时间，当前接口没有提供发布时间，因此不显示。

支持刷新、15 秒超时及局部重试。联网失败时保留错误，用户可手动选择“离线演示”；不会把样例当作真实预报。演示使用固定日期、固定曲线，在不同点位相同，并显著标注其不代表所选位置实际天气。场景文件只保存点位、面板显隐和数据模式；恢复在线面板会重新请求，不保存天气响应。

### 接口与部署

免费接口由浏览器直接访问 `https://api.open-meteo.com/v1/forecast`，无需密钥；需要网络及部署 CSP 的 `connect-src` 允许该地址。所选坐标会发给天气提供方，不会调用浏览器定位。离线演示文件随示例部署。

数据来源：[Open-Meteo](https://open-meteo.com/)，采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)；界面保留来源链接。免费托管 API 仅适用于非商业用途，官方条款当前列明每天少于 10,000 次、每小时少于 5,000 次、每分钟少于 600 次请求，具体以 [最新条款](https://open-meteo.com/en/terms) 为准。免费服务的可用性和覆盖随提供方而定。

商业部署应使用合适的付费或业务服务，通过 `RainForecastProvider` 替换数据提供方；如涉及密钥，应放在业务后端，不能写入前端或场景文件。本示例不新增后端，不接入在线降水地图。

```ts
import { getRainForecast, summarizeRainForecast } from '@sgyx/cesium-kit-weather'

const controller = new AbortController()
const forecast = await getRainForecast(104, 30, { signal: controller.signal })
console.log(forecast.range, summarizeRainForecast(forecast))
// 强制刷新；同一点的普通查询缓存 10 分钟，最多保存 64 个点。
await getRainForecast(104, 30, { forceRefresh: true })
// 不再需要时取消；其他消费者共享的请求继续运行。
controller.abort()
```

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
