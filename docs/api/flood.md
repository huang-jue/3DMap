# @sgyx/cesium-kit-flood

可选的水旱灾害防御四预能力包。

## 数据

```ts
interface FloodDataset {
  name?: string
  bounds?: FloodBounds
  digitalMirrorUrl?: string
  rivers: River[]
  waterProjects: WaterProject[]
  stations: HydrologyStation[]
  forecastNodes: ForecastNode[]
  rainfallFrames?: RasterFrame[]
  warnings: FloodWarning[]
  rehearsals: RehearsalScenario[]
  knowledge: KnowledgeEntry[]
  plans: PlanTemplate[]
}

interface ForecastNode {
  id: string
  name: string
  lon: number
  lat: number
  warningLevel?: 'normal' | 'attention' | 'warning' | 'guarantee'
  unit?: string
  series: Array<{ time: Date; value: number; forecast: boolean }>
}

interface RehearsalScenario {
  id: string
  name: string
  type: 'flood' | 'breach' | 'dispatch'
  startTime: Date
  endTime: Date
  rasterFrames?: RasterFrame[]
  polygonFrames?: PolygonFrame[]
  breach?: BreachConfig
  dispatch?: DispatchPlan
}
```

```ts
parseFloodDataset(input: unknown): FloodDataset
loadFloodDataset(input: FloodDataset | string): Promise<FloodDataset>
sampleSeries(series, time): number | null
nearestItem(items, time): T | null
findNearestIndex(items, time): number
```

## 数据底板

```ts
createHydroDataFeature(options: HydroDataFeatureOptions): HydroDataFeature
```

```ts
interface HydroDataFeatureOptions {
  data: FloodDataset | string
  name?: string
  visible?: boolean
  digitalMirrorUrl?: string
  onSelect?: (payload: River | WaterProject | HydrologyStation | null) => void
}
```

```ts
class HydroDataFeature {
  readonly data: FloodDataset | null
  setRiversVisible(visible: boolean): void
  setProjectsVisible(visible: boolean): void
  setStationsVisible(visible: boolean): void
  setDigitalMirrorVisible(visible: boolean): void
  setVisible(visible: boolean): void
  flyToDigitalMirror(duration?: number): void
  flyToBounds(duration?: number): void
}
```

## 预报

```ts
createFloodForecastFeature(options): FloodForecastFeature
```

```ts
interface FloodForecastFeatureOptions {
  data: FloodDataset | string
  name?: string
  visible?: boolean
  showRainfall?: boolean
  followClock?: boolean
  onSelect?: (node: ForecastNode | null) => void
}
```

```ts
interface FloodForecastFeature {
  readonly nodes: ForecastNode[]
  select(id: string | null): void
  setVisible(visible: boolean): void
  setRainfallVisible(visible: boolean): void
  setFollowClock(enabled: boolean): void
  getSeries(id: string): ForecastPoint[]
  getCurrentValue(id: string): number | null
}
```

## 预警

```ts
createFloodWarningFeature(options): FloodWarningFeature
```

支持风险点与风险面，等级 `blue / yellow / orange / red`，按 `startTime / endTime` 自动显隐。

```ts
interface FloodWarningFeature {
  readonly warnings: FloodWarning[]
  select(id: string | null): void
  setVisible(visible: boolean): void
  setTime(time: Date): void
}
```

## 预演

```ts
createFloodRehearsalFeature(options): FloodRehearsalFeature
```

```ts
interface FloodRehearsalFeatureOptions {
  data: FloodDataset | string
  scenarioId?: string
  mode?: 'raster' | 'polygon'
  visible?: boolean
  followClock?: boolean
  syncClockRange?: boolean
  onScenarioChange?: (scenario: RehearsalScenario) => void
  onProjectSelect?: (project: DispatchProject | null) => void
}
```

```ts
interface FloodRehearsalFeature {
  readonly scenarios: RehearsalScenario[]
  readonly scenario: RehearsalScenario | null
  readonly breach: BreachConfig | null
  readonly dispatch: DispatchPlan | null
  setScenario(id: string): void
  setMode(mode: 'raster' | 'polygon'): void
  setVisible(visible: boolean): void
  setTime(time: Date): void
  play(): void
  pause(): void
}
```

## 预案

```ts
createEmergencyPlanFeature(options): EmergencyPlanFeature
```

```ts
interface EmergencyPlanFeature {
  readonly knowledge: KnowledgeEntry[]
  readonly plans: PlanTemplate[]
  search(keyword: string): KnowledgeEntry[]
  generate(input?: PlanGenerateInput): GeneratedPlan
}

interface PlanGenerateInput {
  warningIds?: string[]
  forecastNodeId?: string
  scenarioId?: string
}
```

## 组合插件

```ts
interface FloodPluginConfig {
  data: FloodDataset | string
  name?: string
  digitalMirrorUrl?: string
  scenarioId?: string
  mode?: 'raster' | 'polygon'
  visible?: boolean
  followClock?: boolean
  syncClockRange?: boolean
  showRainfall?: boolean
  showPopup?: boolean
  continueOnError?: boolean
  onLayerError?: (key: FloodPluginErrorKey, error: unknown) => void
  onForecastSelect?: (node: ForecastNode | null) => void
  onWarningSelect?: (warning: FloodWarning | null) => void
  onGenerate?: (plan: GeneratedPlan) => void
}

createFloodPlugin(config: FloodPluginConfig): FloodPlugin
```

`FloodPlugin` 暴露 `hydro / forecast / warnings / rehearsal / plan` 子能力，以及：

```ts
setRiversVisible / setProjectsVisible / setStationsVisible / setDigitalMirrorVisible
setForecastVisible / setRainfallVisible / setWarningsVisible
setRehearsalVisible / setRehearsalMode / setScenario
play / pause
searchKnowledge / generatePlan
```
