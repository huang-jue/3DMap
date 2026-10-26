---
'@cesium-kit/core': minor
'@cesium-kit/vue': minor
---

0.2.0：新增 `ClockService` 时间轴服务、`DataSourceManager`（GeoJSON/CZML/KML）、`TilesetManager`（3D Tiles）、WMS/WMTS 预设；插件契约扩展 `ctx.layers.dataSource/tileset`、`ctx.clock/ctx.time`（**破坏性变更**：`ctx.clock` 由 `Cesium.Clock` 变为 `ClockService`，需要原生 Clock 时使用 `ctx.clock.raw`）；Vue 新增 `useClock`。playground 增加时间轴、图层面板与离线 3D Tiles 样例，并接入 Playwright e2e。
