# @sgyx/cesium-kit-flood

可选的 Cesium 水旱灾害防御“四预”业务插件包：

- 数据底板：河流、水利工程、监测站点、3D 数字镜像
- 预报：预报节点、预报曲线、降雨落区三维柱状演示
- 预警：风险点、风险面、等级配色、时效过滤
- 预演：淹没栅格、GeoJSON 淹没面、溃口推演、联合调度
- 预案：静态知识库检索与预案生成演示
- 图层树、时间轴、点击弹窗与统一回收

## 安装

```bash
pnpm add cesium @sgyx/cesium-kit-core @sgyx/cesium-kit-flood
```

## 使用

```ts
import { createFloodPlugin } from '@sgyx/cesium-kit-flood'

const flood = createFloodPlugin({
  data: '/data/flood/flood.json',
  followClock: true,
  syncClockRange: true,
  showRainfall: true
})

await manager.features.register(flood)
```

## 数据

`FloodDataset` 包含：

```ts
rivers
waterProjects
stations
forecastNodes
rainfallFrames
warnings
rehearsals
knowledge
plans
```

playground 样例：

```text
apps/playground/public/data/flood/flood.json
```

重新生成：

```bash
node scripts/generate-flood-samples.mjs
```

详见 [四预文档](../../docs/guide/flood.md)。
