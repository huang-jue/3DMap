# Cesium Kit

以 Cesium 为渲染底座的基础能力库，供业务项目（后续如洪水演进等）以 npm 插件方式接入。

仓库为 pnpm workspace 单仓多包：

| 包                         | 说明                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `@sgyx/cesium-kit-core`    | 纯 TS 内核：Viewer 生命周期、底图、地形、相机、场景模式、实体、坐标、事件、插件注册表 |
| `@sgyx/cesium-kit-vue`     | Vue 3 适配层：`<CesiumViewer>` 组件与 composables                                     |
| `@sgyx/cesium-kit-weather` | 可选天气预报插件：多图层栅格、时间轴联动与图例                                        |
| `@sgyx/cesium-kit-wind`    | 可选风场插件：GPU 粒子气象风场、风电场 Billboard/Label                                |
| `@sgyx/cesium-kit-vite`    | Vite 插件：复制 Cesium 静态资源并注入 `CESIUM_BASE_URL`                               |
| `apps/playground`          | 本地演示（含 Element Plus 面板，不参与发包）                                          |
| `e2e/`                     | Playwright 端到端测试                                                                 |
| `fixtures/consumer`        | `verify:pack` 使用的干净消费者工程模板                                                |
| `docs/`                    | VitePress 文档                                                                        |

## 能力概览

- Viewer 生命周期、底图（含 WMS/WMTS）、地形、图层
- 相机飞行 / 复位 / 视角约束 / URL 分享
- 场景模式切换（切换后保留视角）、视觉开关、截图
- 实体工厂、坐标转换、2D/3D 统一的点击与悬停拾取
- GeoJSON / CZML / KML 数据源，3D Tiles 加载与样式
- ClockService 时间轴（播放/暂停/倍速/范围/帧驱动）
- 可选天气插件：多图层、时间范围、图例、城市点预报、气象预警与统一图层树
- 可选风场插件：气象风场粒子流、风电场 Billboard/Label 与点击选中
- 绘制与量算：点/线/面/矩形/圆/高差，支持顶点编辑与实时量算
- 绘制成果 GeoJSON 导入导出、版本化场景快照与手动本地保存恢复
- Entity / 3D Tiles 属性查询、单选与悬停高亮
- 图层树：底图/数据源/3D Tiles/实体组/自定义图层统一分组、显隐级联与顺序管理
- 弹窗与标注聚合：DOM 弹窗、Vue 弹窗组件、EntityCluster 标注聚合
- 业务插件注册表（图层自动回收）与资产自检

## 环境要求

- Node.js >= 22
- pnpm >= 10

## 本地开发

```bash
pnpm install
pnpm dev            # 启动 apps/playground
```

## 常用命令

```bash
pnpm build           # 构建 packages/*（产物含 .d.ts）
pnpm test            # 运行各包单测
pnpm typecheck       # 全部包类型检查
pnpm typecheck:e2e   # e2e 类型检查
pnpm lint            # ESLint
pnpm format          # Prettier
pnpm verify:pack     # 打 tarball 并在干净工程中安装/类型检查/构建（发版前必跑）
pnpm e2e             # Playwright 端到端测试（首次需 pnpm e2e:install）
pnpm docs:dev        # 启动文档
```

> e2e 使用 Chromium + SwiftShader 软件渲染，首次运行较慢；CI 中该 job 目前为
> `continue-on-error`（观察一周后再转为阻塞）。

## 发版

```bash
pnpm verify:pack    # 1. 确认 tarball 在干净工程可用
pnpm changeset      # 2. 记录变更
pnpm version-packages
pnpm release        # 3. 构建并发布变更的包（changeset publish）
```

各包通过 changesets 的 `linked` 配置保持版本一致。

> 根目录是私有 monorepo 工程，**不要在根目录执行 `npm publish`**。请在根目录使用 `pnpm release`，或进入具体包目录执行 `npm publish --access public`。

首次发布或直接发布所有子包：

```bash
pnpm publish:dry-run   # 预演，不真正上传
pnpm publish:packages  # 构建并发布 packages/* 下的所有包
```

### 发布前检查

- `packages/*/package.json` 中的 `repository` / `homepage` / `bugs` 目前是占位地址，发布前请替换为真实仓库地址
- 确认 npm scope 与 `LICENSE` 年份
- CI 中的 `Release` 工作流依赖 `NPM_TOKEN` secret

## 设计约束

1. Cesium 走 `peerDependencies`，不打进产物。
2. 内核不含任何业务概念；业务能力以 `CesiumFeature` 插件形式接入。
3. 库内不含 UI 框架依赖，UI 由宿主决定。
4. CSS 单独产出，需消费者显式引入 `@sgyx/cesium-kit-vue/style.css`。
