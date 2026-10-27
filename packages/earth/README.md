# @sgyx/cesium-kit-earth

可选的 Cesium 全球地球可视化插件：

- 大气、海洋、化学、颗粒物、空间天气、生物六种模式
- 风、洋流、波浪 GPU 粒子矢量场
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

```text
apps/playground/public/data/earth/manifest.json
```

重新生成：

```bash
node scripts/generate-earth-samples.mjs
```

详见 [地球可视化文档](../../docs/guide/earth.md)。
