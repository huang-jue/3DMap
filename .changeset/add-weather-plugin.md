---
'@cesium-kit/core': minor
'@cesium-kit/weather': minor
---

新增可选天气预报插件 `@cesium-kit/weather`：

- 通用栅格天气图层，内置降水、雷达、温度、云量、湿度、气压色带
- 支持网格数据 Canvas 渲染、图片帧、跨帧淡入淡出与下一帧预加载
- 多时刻数据跟随 `ClockService`，支持可选时间范围、懒加载、错误隔离与实时刷新
- 城市点预报与气象预警图层，支持内置弹窗和 `onSelect` 回调
- playground 增加天气预报面板、静态样例数据、城市/预警交互与时间范围快捷选择
- core 新增 `LayerManager.addCustom`、`CustomLayerHandle` 与 `FeatureContext.layerManager`，插件自管图元可接入统一图层树
