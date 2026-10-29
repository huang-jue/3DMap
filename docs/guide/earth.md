# 地球可视化

`@sgyx/cesium-kit-earth` 参考 earth.nullschool.net 的交互方式，把全球大气、海洋、化学、颗粒物、空间天气和生物数据封装为 Cesium 插件。

## 能力

- 模式：大气 / 海洋 / 化学 / 颗粒物 / 空间天气 / 生物
- 矢量场：风、洋流、波浪
- 标量叠加：温度、湿度、降水、海温、PM2.5、CO2、极光等
- 注释：火点、极光、珊瑚白化
- 城市预报、气象预警、风电场
- 时间、图例、点查
- 投影：球面 / 正交球面 / 平面 / 哥伦布
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
earth.setProjection('ORTHOGRAPHIC')
earth.setProjection('2D')
earth.setProjection('COLUMBUS_VIEW')
```

正交球面通过 Cesium 的正交相机显示地球，接近参考页面的 orthographic 视图。其他二维投影需要独立的投影渲染管线。

地球插件采用随 Cesium 投影的屏幕空间连续轨迹，球面、平面和哥伦布模式均可显示流线。
原有 `wind` 包的 GPU 粒子渲染仍作为默认接口保留；地球插件选择 `renderer: 'trails'`。
轨迹采用双线性空间采样、经纬度中点积分和 U/V 时间插值，按视口布点，拖动或投影变化时清除旧屏幕轨迹。
它是 Canvas 2D 轨迹层叠加 Cesium，并非重新实现 Nullschool 的 WebGL 引擎；最多 5,500 个粒子，按视口及密度设置调整。

## 设置

```ts
earth.setSettings({
  grid: true,
  hd: true,
  dynamic: false,
  interpolation: 'nearest',
  infoBar: true,
  bold: false,
  fontScale: 'normal',
  flowDensity: 128,
  flowSpeed: 1.5,
  overlayAlpha: 0.88
})
```

- `grid`：全球网格叠加
- `hd`：高清粒子/Canvas
- `dynamic`：粒子动画
- `interpolation`：双线性 / 最近邻
- `infoBar` / `bold` / `fontScale`：面板展示设置
- `flowDensity`：可视区域流线密度，演示范围 64–256
- `flowSpeed`：视觉流速倍数，不改变数据单位或点查风速
- `overlayAlpha`：标量叠加透明度，0–1

## Playground

底部现在提供六模式真实图层目录、八个大气高度和独立动画/叠加层选择。
详见[参考网站面板对照及剩余差异](./earth-reference-audit.md)。

真实数据集包含 GFS 风场与 CAMS PM2.5。顶部「颗粒物 · PM2.5」直接切换浓度图，
`/?earth=pm25` 可直接进入正交球面 PM2.5 演示。0.4° 原始 CAMS 网格使用 µg/m³ 和对数色阶，
蓝色表示低浓度、黄红色表示高浓度；可同时显示 GFS 风流线或在矢量场中关闭流线。
三个浓度预报时刻与风场一致，数据卡显示实际选中的色层时间、分辨率和独立来源。
这份演示是固定快照，不会自动追踪参考网站的实时更新。

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

## 真实 GFS 离线演示

进入地球模式后默认加载真实风场；菜单的“数据集”可切换回六种模式的合成样例。

- 来源：NOAA/NCEP GFS，由 earth.nullschool.net 的公开数据服务分发。
- 数据：地表上方 10 m 的 U/V 风分量；风速叠加由相同分量计算。
- 网格：原始 0.5°、720 × 361；旋转经度、翻转纬度行序后补一个重复端点，运行网格为 721 × 361。补端点用于接缝连续，不增加气象精度。
- 有效时刻：2026-10-27 01:00、03:00、06:00 UTC（北京时间 09:00、11:00、14:00）。这是一份固定预报快照，不是实时观测。
- 时间滑块支持连续 U/V 插值；风速色层按最近的原始时刻切换，固定点查在当前时间重新采样。
- `provenance.json` 记录模型起报时间、有效时间、原始 URL 和 SHA-256；`raw/` 保留站点 EPak 原文件。
- 海岸线取自站点公开 `earth-topo.json` 的 Natural Earth `coastline_110m`。
- 城市预报、气象预警、风电场为可选的合成业务样例，和真实 GFS 风场明确区分。真实风场清单的 `weather.sampleTime` 固定城市与预警的业务演示时间，避免 7 月样例被 10 月风场时间过滤；原始样例日期不会改写。开关显示加载状态、数量和重试结果，“定位”可查看数据范围。

```text
apps/playground/public/data/earth/real/
  manifest.json
  wind.json
  speed.json
  pm25.json
  coastline.json
  provenance.json
  raw/
```

无需外网即可运行演示。保留原始数据时可离线重新转换：

```bash
node scripts/import-earth-snapshot.mjs
node --test scripts/earth/snapshot.test.mjs
```

转换脚本验证 EPak 网格、数值范围和帧时间，只接受该快照使用的 `ppak` 块。它不会把合成温度、海洋或污染物数据标记为真实数据。

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
