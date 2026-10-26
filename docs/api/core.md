# @cesium-kit/core

## `CesiumViewerManager`

```ts
static create(container: HTMLElement, options?: CesiumKitOptions): Promise<CesiumViewerManager>
```

| 成员 | 说明 |
| --- | --- |
| `viewer` | 底层 `Cesium.Viewer` |
| `imagery` / `terrain` / `camera` / `scene` / `entities` / `coords` / `features` | 能力模块 |
| `draw` / `popup` / `layerManager` | 绘制量算、弹窗与图层树 |
| `events` | `EventBus<CesiumKitEventMap>` |
| `isReady` / `isDestroyed()` | 状态判断 |
| `getViewer()` | 获取 Viewer，销毁后调用会抛错 |
| `flyHome(duration?)` | 视角复位 |
| `setSceneMode(mode, duration?)` | 投影切换（保留视角） |
| `destroy()` | 幂等销毁 |

## `ImageryManager`

```ts
add(source: ImagerySource, options?: AddImageryOptions): Promise<Cesium.ImageryLayer>
addMany(list: Array<{ source: ImagerySource } & AddImageryOptions>): Promise<Cesium.ImageryLayer[]>
switchTo(id: string | null): void
setShow(id: string, show: boolean): void
setAlpha(id: string, alpha: number): void
remove(id: string): void
clear(): void
list(): ImageryLayerInfo[]
```

`ImagerySource` = 预设 id（`'naturalEarth' | 'osm' | 'arcgis'`）| `ImageryProvider` | `Promise<ImageryProvider>` | 工厂函数。

辅助函数：`createXyzImagery(url, options)`、`imageryPresets`。

## `TerrainManager`

```ts
set(input: 'ellipsoid' | 'world' | TerrainProvider | Terrain): Promise<void>
reset(): void
current: 'ellipsoid' | 'world' | 'custom'
```

## `CameraService`

```ts
getView(): CameraView
flyTo(target: CameraTarget, options?: FlyToOptions): void
setView(target: CameraTarget, options?: FlyToOptions): void
flyHome(duration?: number): void
setHome(target, orientation?): void
hasHome(): boolean
onChange(handler): () => void
setTracking(enabled: boolean, percentageChanged?: number): void
setConstraints(constraints: CameraConstraints): void
getConstraints(): CameraConstraints
setCollisionDetection(enabled: boolean): void
getShareUrl(baseUrl?: string): string
applyFromUrl(url?: string): boolean
```

`CameraConstraints`：`{ minHeight?, maxHeight?, minPitch?, maxPitch? }`（高度米、俯仰度）。

纯函数：`encodeCameraState / decodeCameraState / buildShareUrl`。

`CameraTarget` = `{ lon, lat, height? }` | `{ west, south, east, north }` | `Cartesian3` | `{ destination, orientation? }`。
`FlyToOptions` 中的 `heading/pitch/roll` 均为**度**，`pitch` 默认 `-90`。

## `PickService`

```ts
on(type: 'click' | 'hover', handler): () => void
off(type, handler): void
setEnabled(enabled: boolean): void
setHoverInterval(ms: number): void
pickAt(windowPosition?): PickEventPayload | undefined
destroy(): void
```

`PickEventPayload` = `{ position, lonLatHeight, screen: { x, y }, entity? }`。

## `SceneService`

```ts
setMode(mode: SceneModeName, duration?: number): void
getMode(): SceneModeName
setLighting(enabled: boolean): void
setDepthTestAgainstTerrain(enabled: boolean): void
setFog(enabled: boolean): void
setSkyAtmosphere(enabled: boolean): void
setSkyBox(visible: boolean): void
setSun(visible: boolean): void
setMoon(visible: boolean): void
setGlobeVisible(visible: boolean): void
setBaseColor(color: ColorInput): void
setRequestRenderMode(enabled: boolean, maximumRenderTimeChange?: number): void
requestRender(): void
screenshot(options?: { type?: string; quality?: number }): { dataUrl: string; blob: Blob | null }
```

## `EntityService`

```ts
add(entity: Cesium.Entity): Cesium.Entity
addMany(entities: Cesium.Entity[]): Cesium.Entity[]
get(id: string): Cesium.Entity | undefined
list(): Cesium.Entity[]
filter(predicate): Cesium.Entity[]
remove(id: string): boolean
removeAll(ids: string[]): void
clear(): void
count: number
```

工厂函数：`createPoint` / `createLabel` / `createPolyline` / `createPolygon` / `createModel`。

## `DrawService`

```ts
start(type: DrawType, options?: DrawOptions): DrawSession
cancel(): void
clear(): void
destroy(): void
sessionList: DrawSession[]
isDrawing: boolean
```

`DrawType` = `'point' | 'polyline' | 'polygon' | 'rectangle' | 'circle' | 'height'`。

`DrawOptions`：`id / name / clampToGround / style / measure / editable / onUpdate / onComplete / onCancel`。

`DrawSession`：`finish / cancel / remove / setEditable / updateVertex`，只读 `id / type / state / result / positions / editable`。

量算纯函数：

```ts
measureDistance(positions, { surface? }): { distance, segments, heightDiff }
measureArea(positions): { area, perimeter }
measureHeight(a, b): number
measureCircle(center, edge): { radius, area, circumference }
measureRectangle(a, b): { width, height, area, perimeter }
summarizeMeasurement(type, cartesianPositions): MeasurementSummary
formatDistance / formatArea / formatHeight
```

`FeatureContext.draw` 为插件作用域实例，卸载时自动取消并回收实体。

## `LayerManager`

```ts
createGroup(name, options?): LayerNode
addImagery(source, options?): Promise<LayerNode>
addDataSource(name, input, options?): Promise<LayerNode>
addTileset(name, source, options?): Promise<LayerNode>
createEntityGroup(name, options?): Promise<LayerEntityGroup>
move(id, parentId, index): void
setVisible(id, visible): void
setAlpha(id, alpha): void
get(id): LayerNode | undefined
tree(): LayerNode[]
remove(id, { removeSource? }?): void
clear() / destroy()
```

`LayerNode` 包含 `id / name / kind / parentId / visible / effectiveVisible / alpha / effectiveAlpha / sourceId / entityCount / children`。

`LayerEntityGroup`：`dataSource / count / entities / add / addMany / remove / clear / setClustering / destroy`。

事件：`layer:change`，payload `{ action, id, parentId? }`。

## `PopupService`

```ts
open(options: PopupOptions): PopupHandle
close(id: string): void
closeAll(): void
createScope(): PopupScope
size: number
destroy(): void
```

`PopupOptions`：`id / position / content / title / className / offset / closable / showAnchor / zIndex / onClose`。

`PopupHandle`：`id / element / isOpen / setPosition / setContent / setTitle / close`。

`PopupScope`：`open / close / closeAll / dispose / size`，插件卸载时由 `FeatureContext.popup` 自动关闭。

## `MarkerClusterLayer`

```ts
new MarkerClusterLayer(viewer, options?)
add(marker: MarkerInput): Cesium.Entity
addMany(markers): Cesium.Entity[]
remove(id: string): boolean
clear(): void
setVisible(visible: boolean): void
setClustering(options | false): void
handlePick(picked): boolean
destroy(): void
dataSource / size / markers
```

`MarkerInput`：`id / position / name / label / color / size / icon / clampToGround / data`。

`MarkerClusterOptions` 支持 `pixelRange / minimumClusterSize / clusterBillboards / clusterLabels / clusterPoints / clusterEnabled / clusterColor / clusterLabel / defaultClusterAction / pick / onMarkerClick / onClusterClick / dataSource`。

## 坐标工具

```ts
toCartesian(lon, lat, height?): Cesium.Cartesian3
toDegrees(cartesian): LonLatHeight
toRectangle({ west, south, east, north }): Cesium.Rectangle
toScreen(viewer, position): ScreenPosition | undefined
pickPosition(viewer, windowPosition?): PickResult | undefined
sampleHeight(viewer, position): number | undefined
resolvePosition / resolvePositions
createCoordService(viewer): CoordService
```

## `EventBus<T>`

```ts
on(type, handler): () => void
once(type, handler): () => void
off(type, handler): void
emit(type, payload): void
listenerCount(type): number
clear(type?): void
```

单个监听器抛错不会阻断其他监听器，错误交给构造时传入的 `onError`（默认 `console.error`）。

## `FeatureRegistry`

```ts
register<T>(feature: CesiumFeature<T>, options?: T): Promise<void>
unregister(name: string): void
unregisterAll(): void
has(name: string): boolean
names(): string[]
size: number
```

## 类型

`CesiumKitOptions`、`ImageryConfig`、`CameraView`、`CameraTarget`、`SceneModeName`、`ColorInput`、`PositionInput`、`BoundsInput`、`LonLatHeight`、`CesiumKitEventMap`、`CesiumFeature`、`FeatureContext`、`FeatureLayerRegistry`、`PrimitiveLike`。

`FeatureLayerRegistry` 额外提供 `primitive(primitive: PrimitiveLike)`，用于登记自定义 Cesium Primitive，卸载时由内核移除并销毁；`remove / removeById` 用于手动移除已登记实体。

`FeatureContext` 新增 `draw: DrawService` 与 `popup: PopupScope`，均为插件作用域实例，卸载时自动取消绘制并关闭弹窗。

## 日志

```ts
setLogLevel('debug')
createLogger('scope')
```

## 资产自检

```ts
verifyCesiumAssets({ baseUrl?, timeout?, fetchImpl? }): Promise<{
  ok: boolean
  baseUrl: string
  checks: Array<{ name: string; url: string; ok: boolean; status?: number; error?: string }>
}>
```

## `ClockService`

```ts
play() / pause() / toggle()
setMultiplier(n: number)
setRange(start, stop) / clearRange()
loop(enabled: boolean)
seek(time: Date | string | JulianTime)
setStep(seconds) / getStep()
stepForward() / stepBackward()
onTick(cb): () => void
onStateChange(cb): () => void
state: ClockState
raw: Cesium.Clock
```

`ClockState` = `{ currentTime: Date, startTime: Date | null, stopTime: Date | null, multiplier: number, running: boolean, loop: boolean }`。

事件：`clock:tick`、`clock:state`。

## `DataSourceManager`

```ts
add(name, input: DataSourceInput, options?: AddDataSourceOptions): Promise<Cesium.DataSource>
setStyle(name, style: DataSourceStyle): void
setShow(name, show: boolean): void
flyTo(name, duration?): Promise<boolean>
get(name) / list() / has(name) / size
remove(name): boolean
clear() / destroy()
```

`DataSourceInput` = `{ type: 'geojson' | 'czml' | 'kml'; data: string | object | Resource; options? }`
`AddDataSourceOptions` = `{ show?, flyTo?, style?: DataSourceStyle }`

`DataSourceStyle`：`pointColor / pointSize / pointOutlineColor / pointOutlineWidth / lineColor / lineWidth / polygonColor / polygonOutlineColor / labelColor / labelFont / clampToGround`。

## `TilesetManager`

```ts
add(name, source: string | Resource, options?: AddTilesetOptions): Promise<Cesium.Cesium3DTileset>
setStyle(name, style): void
show(name, visible?): void
flyTo(name, duration?): Promise<boolean>
get(name) / list() / has(name) / size
remove(name): boolean
clear() / destroy()
```

`AddTilesetOptions`：`show / maximumScreenSpaceError / shadows / preloadWhenHidden / style / flyTo / tilesetOptions`。

## WMS / WMTS

```ts
createWmsImagery({ url, layers, parameters?, format?, transparent?, version?, crs?, minimumLevel?, maximumLevel?, ... })
createWmtsImagery({ url, layer, style?, tileMatrixSetID, format?, tilingScheme?, minimumLevel?, maximumLevel?, ... })
```


## 成果、场景快照与选择

- `DrawService.exportGeoJSON(): DrawGeoJSON`：导出全部已完成绘制。
- `DrawService.importGeoJSON(input: unknown): DrawSession[]`：完整预校验后导入，生成新 ID。
- `manager.snapshots: SceneSnapshotService`：`capture()`、`restore(input, options?)`、`saveLocal(key?)`、`restoreLocal(key?, options?)`。
- `snapshots.registerResource(id, { kind, source })`：登记宿主资源，返回取消注册函数。
- `SceneSnapshot` 使用 `version: 1`；导出返回 `{ snapshot, skipped }`，恢复返回 `{ succeeded, failed, skipped }`。
- `manager.selection: SelectionService`：`state`、`onChange(handler)`、`select(payload | null)`、`hover(payload | null)`、`clear()`、`setEnabled(enabled)`。
- `SelectionResult`：`kind`、可选 `id`/`layerId`、`properties`、原始 `entity` 或 `feature`。
- `PickEventPayload` 增加可选 `kind` 和 `feature`；`PickService.onMiss(handler)` 订阅无位置命中。
- `CesiumKitErrorPayload` 增加可选 `resourceId`，source 新增 `datasource`、`tileset`。
- 事件新增 `resource:change`（资源移除/样式变更）与 `draw:remove`。

行为与完整示例见[成果保存、场景快照与选择](../guide/persistence-selection.md)。
