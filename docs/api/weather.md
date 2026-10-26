# @cesium-kit/weather

可选的 Cesium 天气预报能力包。

## 数据

```ts
type WeatherLayerKind =
  | 'precip'
  | 'radar'
  | 'temperature'
  | 'cloud'
  | 'humidity'
  | 'pressure'

interface WeatherFrame {
  time: Date
  bounds: { west: number; south: number; east: number; north: number }
  width?: number
  height?: number
  values?: Float32Array | number[]
  imageUrl?: string
  noData?: number
}

interface WeatherLayerData {
  kind: WeatherLayerKind
  name?: string
  unit?: string
  frames: WeatherFrame[]
  legend?: { min: number; max: number; colors: string[]; unit?: string }
  scale?: 'linear' | 'log'
  defaultVisible?: boolean
  defaultAlpha?: number
}
```

```ts
parseWeatherLayer(input: unknown): WeatherLayerData
parseWeatherDataset(input: unknown): WeatherDataset
parseWeatherJson(input: unknown): WeatherDataset
loadWeatherLayer(input: WeatherLayerData | string): Promise<WeatherLayerData>
loadWeatherDataset(input: WeatherDataset | WeatherLayerData | string): Promise<WeatherDataset>
```

## 时间工具

```ts
framesRange(frames: WeatherFrame[]): WeatherTimeRange | null
intersectRanges(layers: Array<{ frames: WeatherFrame[] }>): WeatherTimeRange | null
findNearestFrameIndex(frames: WeatherFrame[], time: Date): number
findFrameIndexInRange(frames: WeatherFrame[], time: Date, range?: WeatherTimeRange): number
clampRange(range: WeatherTimeRange, available: WeatherTimeRange | null): WeatherTimeRange
```

## 栅格图层

```ts
class RasterWeatherLayer {
  constructor(viewer: Cesium.Viewer, data: WeatherLayerData, options?: RasterWeatherLayerOptions)
  add(): void
  remove(): void
  updateFrame(frame: WeatherFrame): void
  show: boolean
  alpha: number
  frame: WeatherFrame
  renderLayer: Cesium.ImageryLayer | null
  frameImageUrl(frame: WeatherFrame): string
  getValueAt(lon: number, lat: number): number | null
  zoomTo(duration?: number): void
  isDestroyed(): boolean
  destroy(): void
}

interface RasterWeatherLayerOptions {
  visible?: boolean
  alpha?: number
  colors?: string[]
  min?: number
  max?: number
  scale?: 'linear' | 'log'
  canvasScale?: number
}
```

## 单图层插件

```ts
interface WeatherRasterFeatureOptions extends RasterWeatherLayerOptions {
  kind: WeatherLayerKind
  data: WeatherLayerData | string
  name?: string
  followClock?: boolean
  syncClockRange?: boolean
  timeRange?: [Date | string, Date | string]
  flyTo?: boolean
}

createWeatherRasterFeature(options: WeatherRasterFeatureOptions): WeatherRasterFeature
```

`WeatherRasterFeature` 提供：

```ts
readonly kind: WeatherLayerKind
readonly layer: RasterWeatherLayer | null
readonly data: WeatherLayerData | null
readonly frames: WeatherFrame[]
setVisible(visible: boolean): void
setAlpha(alpha: number): void
setTime(time: Date): void
setTimeRange(start: Date | string, end: Date | string): void
getTimeRange(): WeatherTimeRange | null
getAvailableRange(): WeatherTimeRange | null
getCurrentFrame(): WeatherFrame | null
getValueAt(lon: number, lat: number): number | null
zoomTo(duration?: number): void
```

## 多图层插件

```ts
interface WeatherPluginConfig {
  layers: WeatherRasterFeatureOptions[]
  name?: string
  timeRange?: [Date | string, Date | string]
  followClock?: boolean
  syncClockRange?: boolean
}

createWeatherPlugin(config: WeatherPluginConfig): WeatherPlugin
```

`WeatherPlugin` 提供：

```ts
readonly layers: Partial<Record<WeatherLayerKind, WeatherRasterFeature>>
setLayerVisible(kind: WeatherLayerKind, visible: boolean): void
setLayerAlpha(kind: WeatherLayerKind, alpha: number): void
setTime(time: Date): void
setTimeRange(start: Date | string, end: Date | string): void
getTimeRange(): WeatherTimeRange | null
getAvailableRange(): WeatherTimeRange | null
getCurrentFrame(kind: WeatherLayerKind): WeatherFrame | null
getValueAt(kind: WeatherLayerKind, lon: number, lat: number): number | null
```
