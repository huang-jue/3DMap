---
'@cesium-kit/core': minor
'@cesium-kit/wind': minor
---

新增可选风场插件 `@cesium-kit/wind`：

- 气象风场：封装 `cesium-wind-layer` 的 GPU 粒子流，支持原生 U/V 网格与 GFS/Windy JSON、双线性插值、多时刻切片、色带与粒子参数配置。
- 风电场：Billboard + Label，支持状态色、功率/风速时间序列、点击选中高亮。
- `createWindPlugin` 支持按配置只启用气象风场或风电场。

core 新增 `FeatureLayerRegistry.primitive()` 与 `PrimitiveLike`，插件可登记自定义 Primitive 并由内核统一回收。playground 增加风场面板、样例数据与 `VITE_ENABLE_WIND` 开关。
