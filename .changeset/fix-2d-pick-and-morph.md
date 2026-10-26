---
'@cesium-kit/core': patch
'@cesium-kit/vue': patch
'@cesium-kit/vite': patch
---

修复与发布质量：2D/哥伦布视图坐标拾取失效、连续切换投影回写过期视角与监听泄漏、底图管理器销毁后仍可操作；新增统一 `error` 事件、`imagery:update` 事件、`v-model:base-layer` / `v-model:scene-mode` 回写；补齐相机/场景/底图/拾取单元测试与 tarball 安装冒烟验证。
