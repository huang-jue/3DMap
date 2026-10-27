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
  setOverlay(id: string | null): Promise<void>
  setVector(id: string | null): Promise<void>
  setAnnotation(id: string, visible: boolean): void | Promise<void>
  setWeatherPointsVisible(visible: boolean): void | Promise<void>
  setWeatherWarningsVisible(visible: boolean): void | Promise<void>
  setWindFarmVisible(visible: boolean): void | Promise<void>
  setProjection(projection: '3D' | '2D' | 'COLUMBUS_VIEW'): void
  setTime(time: Date): void
  setTimeRange(start: Date, end: Date): void
  setFollowClock(enabled: boolean): void
  setSettings(settings: Partial<EarthSettings>): void
  probe(lon: number, lat: number): EarthProbeResult
  getLegend(): EarthLegend | null
}
```

## 子能力

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
