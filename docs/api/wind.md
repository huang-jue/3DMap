# @cesium-kit/wind

可选的 Cesium 风场能力包。主入口包含气象风场与风电场，也可以只从 `@cesium-kit/wind/farm` 引入风电场。

## 数据

```ts
interface WindGrid {
  u: Float32Array | number[]
  v: Float32Array | number[]
  width: number
  height: number
  bounds: { west: number; south: number; east: number; north: number }
  speed?: Float32Array | number[]
  refTime?: Date
}

interface WindSample {
  u: number
  v: number
  speed: number
  direction: number
}
```

```ts
parseWindJson(input: unknown, options?: ParseWindOptions): WindGrid
normalizeWindGrid(input: WindGrid | string, options?: ParseWindOptions): WindGrid
loadWindGrid(input: WindGrid | WindGrid[] | string, options?): Promise<WindGrid>
loadWindGrids(input: WindGrid | WindGrid[] | string, options?): Promise<WindGrid[]>
interpolateWind(grid: WindGrid, lon: number, lat: number): WindSample | null
sampleTimeSeries(series: NumericSeries | undefined, time: Date): number | undefined
findNearestTimeIndex(grids: Array<{ refTime?: Date }>, time: Date): number
```

`ParseWindOptions`：`{ rowOrder?: 'south' | 'north'; flipY?: boolean }`。

## 气象风场

```ts
class WindFieldLayer implements PrimitiveLike {
  constructor(viewer: Cesium.Viewer, grid: WindGrid, options?: WindFieldLayerOptions)
  add(): void
  remove(): void
  show: boolean
  data: WindGrid
  updateData(grid: WindGrid): void
  updateOptions(options: Partial<WindFieldLayerOptions>): void
  getDataAtLonLat(lon: number, lat: number): WindSample | null
  zoomTo(duration?: number): void
  isDestroyed(): boolean
  destroy(): void
}
```

`WindFieldLayerOptions`：

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `particlesTextureSize` | `256` | 粒子纹理尺寸，粒子数 = size² |
| `particleHeight` | `50000` | 粒子离地高度（米），过小会被地形遮挡 |
| `lineWidth` | `{ min: 1.2, max: 2.2 }` | 粒子轨迹宽度 |
| `lineLength` | `{ min: 300, max: 900 }` | 粒子轨迹长度，过小会退化成点 |
| `speedFactor` | `1.5` | 速度倍率 |
| `dropRate` | `0.002` | 粒子重置概率 |
| `dropRateBump` | `0.0005` | 慢速粒子额外重置概率 |
| `colors` | 白色 | 粒子色带 |
| `flipY` | `false` | 翻转 Y 轴 |
| `useViewerBounds` | `false` | 按视口范围播种 |
| `domain` / `displayRange` | `undefined` | 色带/显示范围 |
| `dynamic` | `true` | 是否播放动画 |
| `showSpeedOverlay` | `false` | 是否叠加风速彩色底图 |
| `speedOverlayAlpha` | `0.4` | 风速底图透明度 |
| `speedOverlayColors` | 蓝→青→绿→黄 | 风速底图色带 |

```ts
interface WindFieldFeatureOptions extends WindFieldLayerOptions {
  data: WindGrid | WindGrid[] | string
  name?: string
  parse?: ParseWindOptions
  followClock?: boolean
  flyTo?: boolean
}

interface WindFieldFeature extends CesiumFeature<WindFieldFeatureOptions> {
  readonly layer: WindFieldLayer | null
  readonly grids: WindGrid[]
  setVisible(visible: boolean): void
  updateData(data: WindGrid | WindGrid[] | string): Promise<void>
  updateOptions(options: Partial<WindFieldLayerOptions>): void
  getDataAtLonLat(lon: number, lat: number): WindSample | null
}

createWindFieldFeature(options: WindFieldFeatureOptions): WindFieldFeature
```

## 风电场

```ts
type TurbineStatus = 'running' | 'stopped' | 'maintenance' | 'fault'
type NumericSeries = number | Array<{ time: Date | string; value: number }>

interface WindTurbine {
  id: string
  name?: string
  lon: number
  lat: number
  height?: number
  status?: TurbineStatus
  capacity?: number
  power?: NumericSeries
  windSpeed?: NumericSeries
  windDirection?: NumericSeries
  [key: string]: unknown
}
```

```ts
interface WindFarmLayerOptions {
  statusColors?: Partial<Record<TurbineStatus, string>>
  pointSize?: number
  label?: {
    show?: boolean
    fields?: Array<'name' | 'power' | 'windSpeed'>
    font?: string
    color?: string
    pixelOffset?: [number, number]
  }
  selectedColor?: string
  selectedScale?: number
  statusText?: Partial<Record<TurbineStatus, string>>
  onSelect?: (turbine: WindTurbine | null) => void
  addEntity?: (entity: Cesium.Entity) => Cesium.Entity
  windSampler?: (lon: number, lat: number) => WindSample | null
}

class WindFarmLayer {
  constructor(viewer: Cesium.Viewer, turbines: WindTurbine[], options?: WindFarmLayerOptions)
  readonly size: number
  readonly selected: WindTurbine | null
  getTurbines(): WindTurbine[]
  setWindSampler(sampler?: (lon: number, lat: number) => WindSample | null): void
  setVisible(visible: boolean): void
  handlePick(entity: Cesium.Entity | undefined): void
  select(id: string | null): void
  clearSelection(): void
  destroy(): void
}
```

```ts
interface WindFarmFeatureOptions extends WindFarmLayerOptions {
  turbines: WindTurbine[] | string
  name?: string
}

interface WindFarmFeature extends CesiumFeature<WindFarmFeatureOptions> {
  readonly layer: WindFarmLayer | null
  readonly turbines: WindTurbine[]
  select(id: string | null): void
  setVisible(visible: boolean): void
  setWindSampler(sampler?: (lon: number, lat: number) => WindSample | null): void
}

createWindFarmFeature(options: WindFarmFeatureOptions): WindFarmFeature
loadTurbines(input: WindTurbine[] | string): Promise<WindTurbine[]>
```

## 组合插件

```ts
interface WindPluginConfig {
  field?: WindFieldFeatureOptions | false
  farm?: WindFarmFeatureOptions | false
  name?: string
}

interface WindPlugin extends CesiumFeature {
  readonly field: WindFieldFeature | null
  readonly farm: WindFarmFeature | null
}

createWindPlugin(config: WindPluginConfig): WindPlugin
```
