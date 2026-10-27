# 地球可视化

`@sgyx/cesium-kit-earth` 参考 earth.nullschool.net 的交互方式，把全球大气、海洋、化学、颗粒物、空间天气和生物数据封装为 Cesium 插件。

## 能力

- 模式：大气 / 海洋 / 化学 / 颗粒物 / 空间天气 / 生物
- 矢量场：风、洋流、波浪
- 标量叠加：温度、湿度、降水、海温、PM2.5、CO2、极光等
- 注释：火点、极光、珊瑚白化
- 城市预报、气象预警、风电场
- 时间、图例、点查
- 投影：球面 / 平面 / 哥伦布
- 网格、高清、插值、信息栏、字体设置

## 启用

```ts
import { createEarthPlugin } from '@sgyx/cesium-kit-earth'

const earth = createEarthPlugin({
  data: '/data/earth/manifest.json',
  mode: 'atmosphere',
  vector: 'wind',
  overlay: 'temperature',
  followClock: true,
  syncClockRange: true,
  settings: {
    grid: false,
    hd: false,
    dynamic: true,
    interpolation: 'bilinear'
  }
})

await manager.features.register(earth)
```

## 模式切换

```ts
await earth.setMode('ocean')
await earth.setVector('currents')
await earth.setOverlay('sst')
```

每个模式自带默认矢量场和叠加层。无矢量场的模式会自动隐藏矢量选择。

## 时间

```ts
earth.setTime(new Date())
earth.setTimeRange(start, end)
earth.setFollowClock(true)
```

地球模式使用统一的 `ClockService`，可以在时间轴面板或地球面板中播放、暂停和倍速。

## 点查

```ts
const result = earth.probe(116.39, 39.9)
// {
//   vector: { id, speed, direction, unit },
//   overlay: { id, value, unit, color },
//   annotations: [...]
// }
```

点击地图时，`onProbe` 回调会返回同样结构。

## 投影

```ts
earth.setProjection('3D')
earth.setProjection('2D')
earth.setProjection('COLUMBUS_VIEW')
```

Cesium 原生只稳定支持这三种模式。earth.nullschool 的九种二维投影需要独立的投影渲染管线，暂不在本插件内实现。

平面 / 哥伦布模式下 GPU 粒子矢量场会自动暂停，切换回球面后恢复。

## 设置

```ts
earth.setSettings({
  grid: true,
  hd: true,
  dynamic: false,
  interpolation: 'nearest',
  infoBar: true,
  bold: false,
  fontScale: 'normal'
})
```

- `grid`：全球网格叠加
- `hd`：高清粒子/Canvas
- `dynamic`：粒子动画
- `interpolation`：双线性 / 最近邻
- `infoBar` / `bold` / `fontScale`：面板展示设置

## Playground

顶部「地球模式」进入沉浸式地球面板：

- 模式
- 矢量场 / 叠加层
- 投影
- 日期时间 / 播放 / 倍速
- 图例
- 注释 / 城市预报 / 气象预警 / 风电场
- 点查
- 设置

退出后恢复左侧工作台。

## 静态样例

```text
apps/playground/public/data/earth/
  manifest.json
  atmosphere/
  ocean/
  chemistry/
  particulate/
  space/
  biology/
  annotations/
scripts/generate-earth-samples.mjs
```

样例包含六种模式、三种矢量场、二十余种标量叠加和三类注释，全部为确定性静态数据。
