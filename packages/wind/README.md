# @cesium-kit/wind

可选的 Cesium 风场能力包：

- 气象风场：基于 `cesium-wind-layer` 的 GPU 粒子流、U/V 网格、色带与时间切片。
- 风电场：Billboard + Label、状态色、功率/风速时间序列、点击选中高亮。

## 安装

```bash
pnpm add cesium @cesium-kit/core @cesium-kit/wind
```

## 气象风场

```ts
import { createWindFieldFeature } from '@cesium-kit/wind'

const windField = createWindFieldFeature({
  data: '/data/wind.json',
  particlesTextureSize: 256,
  speedFactor: 3
})

await manager.features.register(windField)
```

## 风电场

```ts
import { createWindFarmFeature } from '@cesium-kit/wind/farm'

const windFarm = createWindFarmFeature({
  turbines: '/data/turbines.json',
  onSelect: (turbine) => console.log(turbine)
})

await manager.features.register(windFarm)
```

## 按配置组合

```ts
import { createWindPlugin } from '@cesium-kit/wind'

await manager.features.register(
  createWindPlugin({
    field: { data: '/data/wind.json' },
    farm: { turbines: '/data/turbines.json' }
  })
)
```

不需要风场的项目不安装此包即可。详见 [风场文档](../../docs/guide/wind.md)。
