# @sgyx/cesium-kit-earth

可选的全球地球可视化能力包。

## 数据

```ts
type EarthMode = 'atmosphere' | 'ocean' | 'chemistry' | 'particulate' | 'space' | 'biology'

interface EarthManifest {
  name?: string
  source?: string
  range: { start: Date; end: Date }
  bounds: { west: number; south: number; east: number; north: number }
  modes: EarthModeConfig[]
  annotations: EarthAnnotationConfig[]
  weather?: {
    points?: string
    warnings?: string
    windFarm?: string
  }
}
```

```ts
parseEarthManifest(input: unknown): EarthManifest
loadEarthManifest(input: EarthManifest | string): Promise<EarthManifest>
parseEarthScalarData(input: unknown): EarthScalarData
loadEarthScalarData(input: EarthScalarData | string): Promise<EarthScalarData>
loadEarthAnnotations(input: EarthAnnotationItem[] | string): Promise<EarthAnnotationItem[]>
```

## 标量图层

```ts
class EarthScalarLayer {
  constructor(viewer, data, options?)
  add(): void
  setTime(time: Date): void
  updateFrame(frame: EarthScalarFrame): void
  setSettings(settings: { interpolation?: EarthInterpolation; hd?: boolean }): void
  getValueAt(lon: number, lat: number): number | null
  colorAt(value: number): string
  show: boolean
  alpha: number
  legend: EarthLegend
  destroy(): void
}
```

## 组合插件

```ts
interface EarthPluginConfig {
  data: EarthManifest | string
  name?: string
  mode?: EarthMode
  vector?: string | null
  overlay?: string | null
  annotations?: string[]
  visible?: boolean
  followClock?: boolean
  syncClockRange?: boolean
  settings?: Partial<EarthSettings>
  weather?: boolean
  onProbe?: (result: EarthProbeResult | null) => void
  onModeChange?: (mode: EarthModeConfig) => void
  onError?: (key: string, error: unknown) => void
}

createEarthPlugin(config: EarthPluginConfig): EarthPlugin
```

```ts
interface EarthPlugin {
  readonly manifest: EarthManifest | null
  readonly mode: EarthModeConfig | null
  readonly overlay: EarthOverlayConfig | null
  readonly vector: EarthVectorConfig | null
  readonly settings: EarthSettings
  readonly annotations: EarthAnnotationFeature[]
  readonly weatherPoints: WeatherPointFeature | null
  readonly weatherWarnings: WeatherWarningFeature | null
  readonly windFarm: WindFarmFeature | null
  setMode(mode: EarthMode): Promise<void>
  setLevel(id: string): Promise<void>
  setOverlay(id: string | null): Promise<void>
  setVector(id: string | null): Promise<void>
  setAnnotation(id: string, visible: boolean): void | Promise<void>
  setWeatherPointsVisible(visible: boolean): void | Promise<void>
  setWeatherWarningsVisible(visible: boolean): void | Promise<void>
  setWindFarmVisible(visible: boolean): void | Promise<void>
  setProjection(projection: '3D' | 'ORTHOGRAPHIC' | '2D' | 'COLUMBUS_VIEW'): void
  setTime(time: Date): void
  setTimeRange(start: Date, end: Date): void
  setFollowClock(enabled: boolean): void
  setSettings(settings: Partial<EarthSettings>): void
  probe(lon: number, lat: number): EarthProbeResult
  getLegend(): EarthLegend | null
}
```

## 子能力

叠加配置 `EarthOverlayConfig` 支持 `scale: 'linear' | 'log'`。
可选 `metadata: { source, resolution, longitudeResolution?, width, height, level, times }` 为各色层提供独立的来源、网格与预报帧时间；
Playground 优先展示该字段，避免把 CAMS 浓度误标为 GFS 风场。

`EarthModeConfig.levels` 为可选的 `EarthLevelConfig[]`，各高度分别配置矢量、色层及默认选择；`defaultLevel` 指定初始高度。
`EarthPlugin.level` 返回当前高度，`setLevel(id)` 切换高度并尽量保留同名叠加产品。
`categories?: string[]` 标识分类色层，点查及 Canvas 使用最近邻。矢量 `kind` 为 wind/currents/waves，元信息独立于色层。

```ts
createEarthScalarFeature(options): EarthScalarFeature
createEarthVectorFeature(options): EarthVectorFeature
createEarthAnnotationFeature(options): EarthAnnotationFeature
createEarthProbeFeature(options): EarthProbeFeature
```

## 设置

```ts
interface EarthSettings {
  grid: boolean
  hd: boolean
  dynamic: boolean
  interpolation: 'bilinear' | 'nearest'
  infoBar: boolean
  bold: boolean
  fontScale: 'small' | 'normal' | 'large'
  flowDensity?: number
  flowSpeed?: number
  overlayAlpha?: number
}
```

## 点查

```ts
interface EarthProbeResult {
  lon: number
  lat: number
  vector: { id: string; speed: number; direction: number; unit: string } | null
  overlay: { id: string; value: number; unit: string; color: string } | null
  annotations: EarthAnnotationItem[]
}
```
