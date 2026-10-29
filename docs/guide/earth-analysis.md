# 地球分析、状态恢复与地图对比

示例保留普通工作台和地球模式。普通工作台的分区折叠后保留组件和图层状态；手机上默认收起为底部抽屉。地球模式的图层、设置和分析共用侧栏，手机上的点查和数据卡片也进入抽屉，避免覆盖地图和时间轴。Escape 关闭面板并将焦点交还入口。

## 点位时间曲线

点击地图固定点位，再选择“查看时间曲线”。标量、矢量速度和去向分别显示，分类变量使用阶梯曲线，缺测不连线。界面时间使用 UTC+8，CSV 使用 UTC ISO 时间并带 UTF-8 BOM，可直接在 Excel 中打开。

```ts
const series = await earth.getPointSeries(120, 30, { signal })
const csv = pointSeriesCsv(series)
```

采样不会改变地图时钟。每个变量按其原始数据时次取值，不人为补齐其他变量的时间点。标量沿用当前空间插值，分类变量固定使用最近邻；矢量使用与点查一致的空间采样。

## 离线数据与加载

本示例使用随项目提供的离线快照，并非实时观测。数据卡片提供来源、分辨率、高度层、有效时间和实际显示色层的时刻。只有元数据明确提供 `publishedAt` 时才显示发布时间。

`openEarthScalarSource` 和 `openWindSource` 先读取帧目录，`getFrame(index, options?)` 才读取对应网格。地球播放加载当前帧及相邻帧，矢量保留两个时刻间的插值；新帧就绪前继续显示旧帧。旧的 `loadEarthScalarData`、`loadWindGrids` 仍可一次返回全部帧。Feature 的 `frames` / `grids` 现在表示已载入的活动帧；完整时间目录由帧源的 `times` 提供，EarthPlugin 还提供 `frameTimes`。

同 URL 的在途请求共享，各调用者独立取消；最后一个调用者取消后才中止底层请求。`sharedDataRepository` 默认最多同时传输 4 个请求，LRU 缓存预算 128 MiB，可通过 `stats` 和 `loads` 查看统计。加载器接受可选的 `signal`、`bypassCache`，现有调用方式继续可用。缓存数据应视为只读。

栅格着色在支持 OffscreenCanvas 的浏览器中使用内联 Worker；其他环境分批处理行，定期让出主线程。图片缓存包含分辨率与插值参数，位图和 Blob URL 在淘汰或销毁时释放。

## 场景保存

普通模式和地球设置里的“成果与场景”入口使用同一份 version 1 场景格式。新增可选 `extensions` 字段，旧文件继续可读。示例扩展记录数据集引用、模式、高度层、标量与矢量、注释、业务图层、显示设置、投影、固定点、抽屉和比较配置。

```ts
const unregister = manager.snapshots.registerExtension('earth', {
  capture: () => earth.getState(),
  restore: (state) => earth.restoreState(state as EarthPluginState)
})
```

扩展先恢复插件和数据，随后核心恢复相机与时钟；可选 `afterRestore` 适合恢复自定义视锥。未知扩展、缺失数据集或局部失败会进入恢复报告，不影响其他项目的结果。状态只包含数据引用与配置，不包含网格或鉴权信息；鉴权资源继续使用宿主资源解析器。

直接传入 manifest 对象的插件需要配置 `dataRef` 才能保存状态。`restoreState` 要求宿主已经安装匹配的数据集；示例只接受内置的真实快照和合成样例两种引用。其他业务插件的运行时自定义图层仍会报告为跳过。

## 双屏和卷帘

在地球设置中开启“地图对比”。A 沿用主面板，B 可独立选择数据集、模式、高度层、标量、矢量和时刻。默认同步视角和时间，双屏时可解除；卷帘始终同步视角。

两个 Viewer 独立持有图层和时钟，共享解析数据缓存。时间超出 B 的范围时使用边界时刻，并显示实际色层时间。卷帘裁剪整个 B 视图，包含风场 Canvas；分割滑块支持触摸和方向键。手机双屏上下排列。退出比较立即销毁 B，恢复 A 的尺寸。

比较会增加渲染负担，因此 B 默认关闭注释、城市预报、预警和风电场。局部加载失败可在 B 面板重试，A 继续可用。

## 回归验证

`pnpm exec playwright test e2e/ui-smoke.spec.ts` 覆盖四种屏幕尺寸、抽屉互斥、时间显示、深色弹层、曲线和 CSV，以及比较状态保存恢复与退出清理。该任务在 CI 中独立阻塞；完整软件渲染套件仍在独立任务中运行。
