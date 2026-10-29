# @sgyx/cesium-kit-earth

可选的 Cesium 全球地球可视化插件：

- 大气、海洋、化学、颗粒物、空间天气、生物六种模式
- 风、洋流、波浪连续轨迹，支持球面和平面投影
- 温度、湿度、降水、海温、PM2.5、CO2、极光等标量叠加
- 火点、极光、珊瑚白化注释
- 时间轴、图例、点查、投影、网格、高清、插值设置
- 城市预报、气象预警、风电场并入地球模式
- 工作台 / 地球模式切换

## 安装

```bash
pnpm add cesium @sgyx/cesium-kit-core @sgyx/cesium-kit-earth
```

## 使用

```ts
import { createEarthPlugin } from '@sgyx/cesium-kit-earth'

const earth = createEarthPlugin({
  data: '/data/earth/manifest.json',
  mode: 'atmosphere',
  vector: 'wind',
  overlay: 'temperature',
  followClock: true,
  syncClockRange: true
})

await manager.features.register(earth)
```

## 数据

Playground 默认使用 `public/data/earth/real/manifest.json` 的 NOAA/NCEP GFS 0.5° 真实离线快照（3 个时刻、10 m 风）。
同一真实数据集还包含 CAMS / ECMWF 的 0.4° PM2.5 浓度预报，三个有效时刻与风场一致。
默认真实数据集现已提供全部六组内容、八个大气高度及化学/海洋/生物等产品。
底部目录可选择模式、高度、动画、色层和投影，`/?earth=co2sc` 可直接打开真实 CO₂。
每个产品保留独立有效时间，单帧产品不会伪造连续预报；[面板对照](../../docs/guide/earth-reference-audit.md)列出支持项及仍存在的投影/波浪动画差异。
顶部「颗粒物 · PM2.5」或 `/?earth=pm25` 可进入正交球面、对数色阶与浓度点查；菜单可关闭风流线。
原始 EPak、来源 URL、SHA-256 和模型时间均保存在 `real/` 下；`node scripts/import-earth-snapshot.mjs` 可离线重新转换。
连续流线使用 Canvas 2D 屏幕轨迹与 Cesium 投影，提供中点积分、U/V 时间插值和视口粒子分布；原 wind 包 GPU 方案仍可使用。

下列六种模式数据为合成样例，在菜单的数据集中单独选择：

```text
apps/playground/public/data/earth/manifest.json
```

重新生成：

```bash
node scripts/generate-earth-samples.mjs
```

详见 [地球可视化文档](../../docs/guide/earth.md)。
