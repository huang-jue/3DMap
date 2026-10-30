# @sgyx/cesium-kit-weather

可选的 Cesium 天气预报能力包。

## 点降雨预报

```ts
getRainForecast(lon: number, lat: number, options?: RainForecastOptions): Promise<RainForecast>
summarizeRainForecast(forecast: RainForecast): RainForecastSummary

interface RainForecastOptions {
  signal?: AbortSignal
  forceRefresh?: boolean
  provider?: RainForecastProvider // 默认 openMeteoRainProvider
}
interface RainForecastHour {
  start: string // UTC ISO，小时区间开始
  end: string // UTC ISO，小时区间结束
  rain: number | null // mm，降雨 + 阵雨，任一缺测则 null
  probability: number | null // %，不根据雨量计算
  precipitation: number | null // mm，含雨雪总降水
  snowfall: number | null // cm
}
interface RainForecastData {
  mode: 'online' | 'demo'
  source: string
  sourceUrl?: string
  hourly: RainForecastHour[]
  referenceTime?: string // 仅固定演示数据使用，在线模式忽略
}
interface RainForecast extends RainForecastData {
  lon: number
  lat: number
  providerId: string
  fetchedAt: string // 获取时间，不是发布时间
  range: { start: string; end: string } | null
}
interface RainForecastProvider {
  id: string
  load(lon: number, lat: number, options: { signal: AbortSignal }): Promise<RainForecastData>
}
interface RainForecastSummary {
  totalRain: number | null
  complete: boolean // 48 个小时雨量均有效
  knownHours: number
  wetPeriods: Array<{ start: string; end: string }> // 小时雨量 ≥0.1 mm，连续时段合并
}

const service = new RainForecastService() // 可创建隔离缓存的实例
service.getRainForecast(lon, lat, options)
parseOpenMeteoRain(input: unknown): RainForecastData // 显式 GMT + Unix 秒响应
```

提供器必须返回完整小时区间、统一单位和显式缺测值；重复时刻、非法数值和非小时区间会报错。服务按时间排序，仅保留当前时间之后的 48 个小时结束时刻，内部缺失小时补为 null，范围外不虚构数据。固定演示按 `referenceTime` 选择，不修改原始日期。

服务按提供器对象与坐标去重和缓存，缓存键中的经纬度取五位小数，避免地图拾取浮点误差引发重复请求；返回坐标保留调用者原值。缓存有效期 10 分钟、最多 64 项，超出淘汰最久未使用项。并发消费者可独立取消，全部取消才终止底层请求；请求整体超时 15 秒，旧请求不能覆盖刷新结果。缓存返回的逐小时对象相互隔离。刷新绕过缓存；失败可再次调用重试。

该服务不依赖 Viewer，不读写地图时钟。现有天气加载器、插件接口和场景 version 1 保持兼容。

## 数据

```ts
type WeatherLayerKind = 'precip' | 'radar' | 'temperature' | 'cloud' | 'humidity' | 'pressure'

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
  preloadFrame(frame: WeatherFrame): void
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
  crossfade?: boolean
  crossfadeDuration?: number
  onError?: (error: unknown) => void
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
  preload?: number
  layerTree?: boolean
  onFrameChange?: (kind: WeatherLayerKind, frame: WeatherFrame) => void
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
setFollowClock(enabled: boolean): void
setTime(time: Date): void
setTimeRange(start: Date | string, end: Date | string): void
getTimeRange(): WeatherTimeRange | null
getAvailableRange(): WeatherTimeRange | null
getCurrentFrame(): WeatherFrame | null
getValueAt(lon: number, lat: number): number | null
zoomTo(duration?: number): void
updateData(data: WeatherLayerData | string): Promise<void>
refresh(): Promise<void>
```

## 多图层插件

```ts
interface WeatherPluginConfig {
  layers: WeatherRasterFeatureOptions[]
  points?: WeatherPointFeatureOptions | false
  warnings?: WeatherWarningFeatureOptions | false
  name?: string
  timeRange?: [Date | string, Date | string]
  followClock?: boolean
  syncClockRange?: boolean
  lazy?: boolean
  continueOnError?: boolean
  onLayerError?: (key: WeatherPluginErrorKey, error: unknown) => void
  onLayerLoaded?: (key: WeatherPluginErrorKey) => void
  onFrameChange?: (kind: WeatherLayerKind, frame: WeatherFrame) => void
  onTimeRangeChange?: (range: WeatherTimeRange | null) => void
}

type WeatherPluginErrorKey = WeatherLayerKind | 'points' | 'warnings'

createWeatherPlugin(config: WeatherPluginConfig): WeatherPlugin
```

`WeatherPlugin` 提供：

```ts
readonly layers: Partial<Record<WeatherLayerKind, WeatherRasterFeature>>
readonly points: WeatherPointFeature | null
readonly warnings: WeatherWarningFeature | null
readonly errors: Partial<Record<WeatherPluginErrorKey, unknown>>
setLayerVisible(kind: WeatherLayerKind, visible: boolean): void | Promise<void>
setLayerAlpha(kind: WeatherLayerKind, alpha: number): void
setPointsVisible(visible: boolean): void
setWarningsVisible(visible: boolean): void
setFollowClock(enabled: boolean): void
setTime(time: Date): void
setTimeRange(start: Date | string, end: Date | string): void
getTimeRange(): WeatherTimeRange | null
getAvailableRange(): WeatherTimeRange | null
getCurrentFrame(kind: WeatherLayerKind): WeatherFrame | null
getValueAt(kind: WeatherLayerKind, lon: number, lat: number): number | null
refresh(): Promise<void>
updateLayerData(kind: WeatherLayerKind, data: WeatherLayerData | string): Promise<void>
```

## 点预报

```ts
interface WeatherPointFeatureOptions extends WeatherPointLayerOptions {
  points: WeatherPointForecast[] | string
  name?: string
  showPopup?: boolean
  onSelect?: (point: WeatherPointForecast | null) => void
}

createWeatherPointFeature(options: WeatherPointFeatureOptions): WeatherPointFeature
```

## 气象预警

```ts
interface WeatherWarningFeatureOptions extends WeatherWarningLayerOptions {
  warnings: WeatherWarning[] | string
  name?: string
  showPopup?: boolean
  onSelect?: (warning: WeatherWarning | null) => void
}

createWeatherWarningFeature(options: WeatherWarningFeatureOptions): WeatherWarningFeature
```
