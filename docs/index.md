---
layout: home

hero:
  name: Cesium Kit
  text: Cesium 基础能力 + 业务插件框架
  tagline: 稳定发包的地图内核，业务能力（洪水演进等）以插件形式接入
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: API
      link: /api/core
features:
  - title: 内核与业务解耦
    details: 内核只提供地图能力，任何业务概念都以 CesiumFeature 插件接入，可独立发版、独立懒加载。
  - title: 资源问题一次解决
    details: '"@sgyx/cesium-kit-vite" 自动复制 Workers / Assets / Widgets 并注入 CESIUM_BASE_URL，告别黑屏与 404。'
  - title: 视角不跳变
    details: 投影切换后自动回写相机视角；相机变化基于 camera.changed 事件，无轮询。
  - title: 类型完整
    details: 全量 TypeScript 实现，产物附带 .d.ts，Cesium 走 peerDependency 不重复打包。
  - title: 可选天气、四预、地球与风场插件
    details: 按项目配置启用天气预报、水旱灾害防御四预、全球地球可视化、气象风场或风电场图层，不安装即不参与构建。
---
