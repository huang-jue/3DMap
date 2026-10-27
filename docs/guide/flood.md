# 水旱灾害防御四预

`@sgyx/cesium-kit-flood` 是可选业务插件包，把水旱灾害防御“四预”能力封装为可复用的 Cesium 插件：

- 数据底板：河流、水利工程、监测站点、三维数字镜像
- 预报：预报节点、实测/预报曲线、降雨落区三维柱状
- 预警：风险点、风险面、等级配色、时间过滤
- 预演：淹没栅格、GeoJSON 淹没面、溃口推演、联合调度
- 预案：静态知识库检索与预案生成演示

不需要四预能力的项目不安装该包即可。

## 安装

```bash
pnpm add @sgyx/cesium-kit-flood
```

## 启用组合插件

```ts
import { createFloodPlugin } from '@sgyx/cesium-kit-flood'

const flood = createFloodPlugin({
  data: '/data/flood/flood.json',
  digitalMirrorUrl: '/tiles/demo/tileset.json',
  scenarioId: 'flood-2026-07',
  visible: true,
  followClock: true,
  syncClockRange: true,
  showRainfall: true,
  showPopup: true,
  continueOnError: true,
  onForecastSelect: (node) => console.log('预报节点', node),
  onWarningSelect: (warning) => console.log('风险预警', warning),
  onLayerError: (key, error) => console.warn(key, error)
})

await manager.features.register(flood)
```

## 数据底板

```ts
flood.setRiversVisible(true)
flood.setProjectsVisible(true)
flood.setStationsVisible(true)
flood.setDigitalMirrorVisible(true)
```

点击河流、水利工程和监测站点会通过 `ctx.pick` 打开弹窗。图层自动挂到“水旱灾害防御”图层树分组。

## 预报

```ts
flood.setForecastVisible(true)
flood.setRainfallVisible(true)

const node = flood.forecast?.nodes[0]
const value = flood.forecast?.getCurrentValue(node.id)
const series = flood.forecast?.getSeries(node.id)
```

`getCurrentValue` 会按 `ClockService` 当前时间在预报序列上线性插值。playground 使用 ECharts 绘制实测/预报曲线。

## 预警

```ts
flood.setWarningsVisible(true)
flood.warnings?.select('warn-river-1')
```

预警支持：

- `dangerous-reservoir` 病险水库
- `small-reservoir` 中小水库
- `mountain-flood` 山洪灾害
- `river-risk` 中小河流
- `urban-flood` 城市内涝

风险等级：`blue / yellow / orange / red`。

## 预演

```ts
flood.setScenario('breach-2026-07')
flood.setRehearsalMode('raster') // 或 polygon
flood.setRehearsalVisible(true)
flood.play()
flood.pause()
```

支持的预演类型：

- `flood`：淹没栅格 + GeoJSON 淹没面
- `breach`：溃口点、溃口流量过程、淹没演进
- `dispatch`：水工程联合调度、入库/出库/水位过程

时间轴统一使用 `ClockService`。`syncClockRange: true` 时切换场景会自动设置时间范围并跳到起始时间。

## 预案

```ts
const results = flood.searchKnowledge('水库')
const plan = flood.generatePlan({
  warningIds: ['warn-reservoir-1'],
  forecastNodeId: 'wuzhou',
  scenarioId: 'flood-2026-07'
})
```

当前为静态知识库和模板生成演示，不接真实大模型。`GeneratedPlan` 包含风险概况、预报结论、调度建议、防御措施、责任分工和知识引用。

## 静态样例

```text
apps/playground/public/data/flood/flood.json
```

包含：

- 11 条河流
- 8 个水利工程
- 10 个监测站点
- 12 个预报节点
- 6 条风险预警
- 6 帧降雨落区
- 3 个预演场景
- 5 条知识、1 个预案模板

重新生成：

```bash
node scripts/generate-flood-samples.mjs
```

## 设计约束

- 不把业务概念写进 `core`
- 静态数据由适配器加载，后续可替换为真实模型 API
- 库本身不依赖 ECharts，图表由 playground 负责
- 预演栅格和淹没面共用 `ClockService`
- 所有 Cesium 对象通过 `ctx.layers` 或图层树自定义句柄回收
