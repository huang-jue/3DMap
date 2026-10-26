# 成果保存、场景快照与选择

## 绘制成果

```ts
const geojson = manager.draw.exportGeoJSON()
const sessions = manager.draw.importGeoJSON(JSON.stringify(geojson))
sessions[0]?.updateVertex(0, { lon: 113.5, lat: 30.5, height: 20 })
```

`exportGeoJSON()` 返回已完成成果的 `FeatureCollection`，不包含正在绘制的草稿。
`importGeoJSON(input: unknown): DrawSession[]` 接受 JSON 字符串或对象，先校验整个集合再添加成果；
默认分配新 ID，保留现有成果。非法文件不会取消当前绘制或添加半份成果。

首版支持 Point、LineString、单环且闭合的 Polygon。拒绝多部件、带孔 Polygon、非法坐标、
不兼容的元数据及样式。坐标为 WGS84 `[经度, 纬度, 高度（米）]`。
矩形和圆输出 Polygon，高差输出 LineString；`properties.cesiumKit` 保存版本、类型、
控制点、样式、量算配置和编辑状态。保留此字段可恢复特殊图形并继续编辑；
移除此字段后按普通 GeoJSON 几何导入。量算值由恢复后的控制点重新计算。

## 场景快照

```ts
const { snapshot, skipped } = manager.snapshots.capture()
// 将 snapshot 作为 JSON 下载；skipped 告知无法保存的内容。
const report = await manager.snapshots.restore(JSON.stringify(snapshot))
console.log(report.succeeded, report.failed, report.skipped)

manager.snapshots.saveLocal() // 手动保存至 localStorage
await manager.snapshots.restoreLocal() // 默认 key：cesium-kit:scene
```

快照格式 `version: 1`，包含相机、场景模式、底图、地形、声明式数据源与 Tiles、
图层分组/顺序/显隐/透明度、绘制成果和时钟状态。恢复后时钟暂停，保留倍速和时间范围。
图层透明度沿用原有能力：影像可叠乘透明度，数据源/Tiles 的透明效果通过各自样式控制。

`capture()` 将当前可保存的对象登记为快照管理内容。`restore()` 仅替换已登记或此前恢复的对象，
保留后来由宿主添加的内容；ID 冲突时为恢复对象分配新 ID 并更新内部图层引用。
新建 Viewer 首次恢复不会删除其默认底图，恢复的底图按快照配置叠加。
恢复会先校验 JSON 结构、版本、绘制成果和资源引用；预检失败不改动场景。
通过预检后逐项加载，网络失败记录在 `failed`，依赖失败资源的图层记入 `skipped`，其余内容继续恢复。
同一服务拒绝同时恢复两份快照，也不允许在恢复中保存。localStorage 不可用或容量不足时方法抛错。

### 自定义及鉴权资源

快照不会序列化函数、Promise、Cesium Resource/Provider、DOM、循环引用或含鉴权参数的配置。
用不含秘密的资源 ID 注册相同输入对象；刷新页面后重新注册，或用解析器提供运行时资源：

```ts
const source = { type: 'geojson' as const, data: new Cesium.Resource({
  url: '/private/data', headers: { Authorization: 'Bearer ...' }
}) }
const unregister = manager.snapshots.registerResource('private-rivers', {
  kind: 'datasource', source
})
await manager.dataSources.add('rivers', source)
const { snapshot } = manager.snapshots.capture()

await manager.snapshots.restore(snapshot, {
  async resolveResource(id, kind) {
    if (id === 'private-rivers' && kind === 'datasource') return { kind, source }
    throw new Error(`未知资源 ${id}`)
  }
})
unregister()
```

解析器返回 `{ kind, source }`，kind 为 `imagery | terrain | datasource | tileset`。
数据源和 Tiles 的样式/显示选项仍须为可序列化配置。注册表仅保存在内存，不写入文件。
未注册的自定义资源、运行时实体组和独立 Entity 会在 `capture().skipped` 中提示；
自定义地形未注册时，快照使用椭球地形并记录提示。业务插件、DOM 弹窗及任意运行时图元不在首版快照中。

## 属性查询和选择

```ts
const off = manager.selection.onChange(({ selected, hovered }) => {
  console.log(selected?.kind, selected?.layerId, selected?.properties)
})
manager.selection.select(manager.pick.pickAt() ?? null)
manager.selection.clear()
manager.selection.setEnabled(false)
off()
```

Viewer 创建后自动监听点击及悬停。单击选中黄色高亮，悬停青色；空白处点击清除选择，
移出要素清除悬停。绘制或拖拽暂停拾取期间不选择，隐藏/删除图层和销毁服务会清理状态。
Entity 高亮使用临时叠加实体，不改原始 Graphics；拾取自动忽略高亮叠加实体。
Tiles feature 高亮临时设置颜色，清除后恢复原颜色；通过 `tilesets.setStyle()` 更新样式前清除对应高亮。
直接修改原生 Tiles 样式不经过此协调逻辑。

拾取结果增加可选 `kind: 'entity' | 'tiles-feature' | 'surface'` 和 `feature`，保留 `entity`、`picked`。
选择结果包含类型、属性、可识别的图层 ID；Entity 使用实体 ID，Tiles 仅在属性提供 `id`、`ID`
或 `globalId` 时返回稳定标识。没有稳定 ID 时不提供跨刷新定位。

## Vue 与演示

```ts
const draw = useDraw()
await draw.importGeoJSON(input)
const geojson = await draw.exportGeoJSON()

const snapshots = useSceneSnapshot()
const { snapshot } = await snapshots.capture()
await snapshots.restore(snapshot)

const { selected, hovered, clear, setEnabled } = useSelection()
```

这些 composable 放在 `<CesiumViewer>` 内使用。`useSelection()` 卸载时取消自身订阅；
选择状态由 Viewer 统一管理。Playground 的“成果与场景”提供上传、下载、本地保存和恢复，
“要素属性”显示当前选中对象的属性。浏览器测试使用仓库内 `tiles/selection` 建筑，完全本地加载。

## 异步加载取消

数据源、Tiles 及地形采用最后一次请求生效的规则。删除、清空或销毁会使未完成的请求失效，
迟到结果释放且不加入场景；逻辑取消不保证中断网络传输，原 Promise 以 `AbortError` 拒绝。
调用方应处理 Promise 拒绝。真实加载错误继续抛出，并通过 `error` 事件提供 `source` 和 `resourceId`；
过期请求不作为真实加载错误上报。加载失败时已被替换的旧资源不会自动恢复。
