# @cesium-kit/weather

可选的 Cesium 天气预报插件包：

- 一个通用栅格渲染引擎，支持降水、雷达、温度、云量、湿度、气压等标量图层
- 网格数据自动转 Canvas 色带图，也支持图片帧
- 多时刻数据跟随 `ClockService`，支持可选时间范围
- 城市/点预报与气象预警
- 隐藏图层懒加载、单图层失败隔离
- 跨帧淡入淡出、下一帧预加载
- 图层独立显隐、透明度与图例，可接入统一图层树
- 不依赖 UI 框架，不直连第三方天气 API

## 安装

```bash
pnpm add cesium @cesium-kit/core @cesium-kit/weather
```

## 使用

```ts
import { createWeatherPlugin } from '@cesium-kit/weather'

const weather = createWeatherPlugin({
  layers: [
    { kind: 'precip', data: '/data/weather/precip.json', visible: true },
    { kind: 'temperature', data: '/data/weather/temperature.json' }
  ],
  followClock: true,
  syncClockRange: true
})

await manager.features.register(weather)

weather.setTimeRange(new Date('2026-07-01T00:00:00Z'), new Date('2026-07-02T00:00:00Z'))
weather.setLayerVisible('precip', true)
weather.setLayerAlpha('precip', 0.8)
const value = weather.getValueAt('precip', 116.39, 39.9)
```

## 数据格式

```json
{
  "kind": "precip",
  "unit": "mm/h",
  "legend": { "min": 0, "max": 30, "colors": ["rgba(255,255,255,0)", "#38bdf8", "#ef4444"] },
  "frames": [
    {
      "time": "2026-07-01T00:00:00Z",
      "bounds": { "west": 100, "south": 20, "east": 130, "north": 40 },
      "width": 2,
      "height": 2,
      "noData": -999,
      "values": [0, 1, 2, 3]
    }
  ]
}
```

`values` 按行优先存储，第 0 行是南侧。也可以用 `imageUrl` 代替 `values` 传图片帧。

详见 [天气预报文档](../../docs/guide/weather.md)。
