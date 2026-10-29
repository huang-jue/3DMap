<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
  watch
} from 'vue'
import {
  Close,
  Expand,
  InfoFilled,
  Location,
  Menu,
  Setting,
  VideoPause,
  VideoPlay
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import * as Cesium from 'cesium'
import { useClock, useViewer } from '@sgyx/cesium-kit-vue'
const EarthAnalysis = defineAsyncComponent(() => import('./EarthAnalysis.vue'))
import EarthCompare from './EarthCompare.vue'
import { formatEarthTime, saveFile, type EarthWorkspaceState } from './earthUtils'
import { sharedDataRepository } from '@sgyx/cesium-kit-core'
import { readEarthRoute, writeEarthRoute } from './earthRoute'
import {
  createEarthPlugin,
  loadEarthManifest,
  DEFAULT_EARTH_SETTINGS,
  type EarthManifest,
  type EarthMode,
  type EarthModeConfig,
  type EarthOverlayConfig,
  type EarthPlugin,
  type EarthProbeResult,
  type EarthProjection,
  type EarthSettings,
  type EarthVectorConfig
} from '@sgyx/cesium-kit-earth'

const emit = defineEmits<{
  close: []
}>()

const { manager, whenReady } = useViewer()
const { state } = useClock()

const loading = ref(true)
const errorText = ref('')
const manifest = ref<EarthManifest | null>(null)
const earth = shallowRef<EarthPlugin | null>(null)
const modeId = ref<EarthMode>('atmosphere')
const levelId = ref('surface')
const vectorId = ref('')
const overlayId = ref('')
const projection = ref<EarthProjection>('3D')
const followClock = ref(true)
const baseMap = ref<'classic' | 'detailed'>('classic')
const speed = ref(21600)
const timeValue = ref(new Date())
const probe = ref<EarthProbeResult | null>(null)
const hoveredProbe = ref<EarthProbeResult | null>(null)
const dataset = ref<'real' | 'sample'>('real')
const busy = ref(false)
let probeMarker: Cesium.Entity | undefined
let restoreEnvironment: (() => void) | undefined
let pendingPlugin: EarthPlugin | null = null
let cancelled = false
const annotationVisible = reactive<Record<string, boolean>>({})
const weatherVisible = reactive({
  points: false,
  warnings: false,
  windFarm: false
})
type WeatherKey = keyof typeof weatherVisible
const weatherBusy = reactive({ points: false, warnings: false, windFarm: false })
const weatherStatus = reactive({ points: '', warnings: '', windFarm: '' })
const weatherLabels = { points: '城市预报', warnings: '气象预警', windFarm: '风电场' }
const weatherSources = { points: 'points', warnings: 'warnings', windFarm: 'windFarm' } as const
const settings = reactive<EarthSettings>({ ...DEFAULT_EARTH_SETTINGS })
const controlsOpen = ref(!window.matchMedia('(max-width: 720px)').matches)
const activeDrawer = ref('layers')
const compareRef = ref<InstanceType<typeof EarthCompare> | null>(null)
const actualSampledTime = ref<Date | null>(null)
const loadedFrameTimes = ref<string[]>([])
const diagnostics = ref(sharedDataRepository.loads)
const cacheStats = ref(sharedDataRepository.stats)
const sceneInput = ref<HTMLInputElement | null>(null)
let readyResolve!: () => void
const initialized = new Promise<void>((resolve) => {
  readyResolve = resolve
})
let initialRequest: AbortController | undefined
let loadRevision = 0
let previousFocus: HTMLElement | null = null
function openDrawer(name: string) {
  previousFocus = document.activeElement as HTMLElement | null
  if (activeDrawer.value === name && controlsOpen.value) controlsOpen.value = false
  else {
    activeDrawer.value = name
    controlsOpen.value = true
  }
}
function toggleData() {
  if (window.matchMedia('(max-width: 720px)').matches) {
    settings.infoBar = true
    openDrawer('data')
  } else settings.infoBar = !settings.infoBar
}
function showAnalysis() {
  activeDrawer.value = 'analysis'
  controlsOpen.value = true
}
function closeDrawer() {
  controlsOpen.value = false
  previousFocus?.focus()
}
function escapeDrawer(event: KeyboardEvent) {
  if (event.key === 'Escape' && !document.querySelector('[role=combobox][aria-expanded=true]'))
    closeDrawer()
}
const statusTimer = setInterval(() => {
  actualSampledTime.value = earth.value?.sampledTime ?? null
  refreshProbe()
  loadedFrameTimes.value = earth.value?.frameTimes.map((time) => time.toISOString()) ?? []
  diagnostics.value = sharedDataRepository.loads
  cacheStats.value = sharedDataRepository.stats
}, 500)
const catalogOpen = ref(true)
const timelineValue = ref(0)

const currentTime = computed(() => state.value?.currentTime ?? new Date())
const flowSpeed = computed({
  get: () => settings.flowSpeed ?? 1.5,
  set: (value: number) => {
    settings.flowSpeed = value
    applySettings()
  }
})
const flowDensity = computed({
  get: () => settings.flowDensity ?? 128,
  set: (value: number) => {
    settings.flowDensity = value
    applySettings()
  }
})
const overlayOpacity = computed({
  get: () => settings.overlayAlpha ?? 0.88,
  set: (value: number) => {
    settings.overlayAlpha = value
    applySettings()
  }
})
const frameTimes = computed(() =>
  loadedFrameTimes.value.length
    ? loadedFrameTimes.value
    : (activeOverlay.value?.metadata?.times ?? manifest.value?.metadata?.times ?? [])
)
const fieldRange = computed(() => {
  const times = frameTimes.value.map((t) => Date.parse(t)).filter(Number.isFinite)
  return times.length
    ? { start: new Date(Math.min(...times)), end: new Date(Math.max(...times)) }
    : manifest.value?.range
})
const timeProgress = computed(() => {
  const range = fieldRange.value
  if (!range) return timelineValue.value
  const total = range.end.getTime() - range.start.getTime()
  if (total <= 0) return 0
  return Math.min(
    100,
    Math.max(0, ((currentTime.value.getTime() - range.start.getTime()) / total) * 100)
  )
})
const activeMode = computed<EarthModeConfig | null>(
  () => manifest.value?.modes.find((mode) => mode.id === modeId.value) ?? null
)
const activeLevel = computed(
  () => activeMode.value?.levels?.find((l) => l.id === levelId.value) ?? activeMode.value
)
const vectors = computed<EarthVectorConfig[]>(() => activeLevel.value?.vectors ?? [])
const overlays = computed<EarthOverlayConfig[]>(() => activeLevel.value?.overlays ?? [])
const activeVector = computed(() => vectors.value.find((v) => v.id === vectorId.value))
const activeOverlay = computed<EarthOverlayConfig | null>(
  () => overlays.value.find((item) => item.id === overlayId.value) ?? null
)
const legend = computed(() => activeOverlay.value)
const fieldMetadata = computed(() => activeOverlay.value?.metadata ?? manifest.value?.metadata)
const fieldSource = computed(() => activeOverlay.value?.metadata?.source ?? manifest.value?.source)
const isPm25 = computed(() => dataset.value === 'real' && overlayId.value === 'pm25')
const productProvider = computed(() =>
  fieldSource.value?.includes('GFS') ? 'GFS' : (fieldSource.value?.split(' / ')[0] ?? 'EARTH')
)
const gridLabel = computed(() => {
  const meta = fieldMetadata.value
  if (!meta) return ''
  const dx = 'longitudeResolution' in meta ? meta.longitudeResolution : undefined
  return dx && dx !== meta.resolution
    ? `${dx}° × ${meta.resolution}° 全球网格`
    : `${meta.resolution}° 全球网格`
})
const vectorTime = computed(() => {
  const times = activeVector.value?.metadata?.times ?? []
  return times.length
    ? new Date(
        times.reduce((best, t) =>
          Math.abs(Date.parse(t) - currentTime.value.getTime()) <
          Math.abs(Date.parse(best) - currentTime.value.getTime())
            ? t
            : best
        )
      )
    : null
})
const sampledTime = computed(() => {
  const times = fieldMetadata.value?.times ?? []
  if (!times.length) return currentTime.value
  const target = currentTime.value.getTime()
  return new Date(
    times.reduce((best, time) =>
      Math.abs(Date.parse(time) - target) < Math.abs(Date.parse(best) - target) ? time : best
    )
  )
})
const legendStyle = computed(() => ({
  background: `linear-gradient(90deg, ${(legend.value?.colors ?? []).join(', ')})`
}))
const legendTicks = computed(() => {
  const item = legend.value
  if (!item) return []
  return [
    item.min,
    item.scale === 'log' ? Math.sqrt(item.min * item.max) : (item.min + item.max) / 2,
    item.max
  ].map((value) => `${formatNumber(value)} ${item.unit}`)
})
const panelClass = computed(() => ({
  'earth-bold': settings.bold,
  [`earth-font-${settings.fontScale}`]: true
}))

const formatTime = formatEarthTime

function formatNumber(value: number): string {
  if (value !== 0 && Math.abs(value) < 1)
    return Number(value.toPrecision(3)).toString()
  if (Math.abs(value) >= 100) return value.toFixed(0)
  return value.toFixed(1).replace(/\.0$/, '')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function syncAnnotationsFromMode(): void {
  const defaults = new Set(activeMode.value?.defaultAnnotations ?? [])
  manifest.value?.annotations.forEach((annotation) => {
    annotationVisible[annotation.id] = defaults.has(annotation.id)
  })
}

function syncSelectionsFromPlugin(): void {
  const plugin = earth.value
  if (!plugin) return
  vectorId.value = plugin.vector?.id ?? ''
  overlayId.value = plugin.overlay?.id ?? ''
  levelId.value = plugin.level?.id ?? activeMode.value?.defaultLevel ?? 'surface'
}

function syncRoute(): void {
  if (dataset.value === 'real')
    writeEarthRoute(
      modeId.value,
      activeMode.value?.levels ? levelId.value : 'surface',
      overlayId.value,
      vectorId.value,
      projection.value
    )
}

function viewMode(mode: EarthMode): void {
  if (mode === 'space') manager.value?.camera.setView({ lon: -100, lat: 75, height: 16_000_000 })
  else if (mode === 'biology')
    manager.value?.camera.setView({ lon: 140, lat: -10, height: 16_000_000 })
  else manager.value?.camera.setView({ lon: 120, lat: 22, height: 16_000_000 })
  if (projection.value === 'ORTHOGRAPHIC') earth.value?.setProjection('ORTHOGRAPHIC')
}

function refreshProbe(): void {
  if (probe.value && earth.value) probe.value = earth.value.probe(probe.value.lon, probe.value.lat)
  if (hoveredProbe.value && earth.value)
    hoveredProbe.value = earth.value.probe(hoveredProbe.value.lon, hoveredProbe.value.lat)
}

async function enable(): Promise<void> {
  const instance = manager.value
  if (!instance) return
  if (!restoreEnvironment) {
    const viewer = instance.getViewer()
    const previousClock = instance.clock.state
    const previousView = instance.camera.getView()
    const previousMode = instance.scene.getMode()
    const previousOrthographic = viewer.camera.frustum instanceof Cesium.OrthographicFrustum
    const previousBase = instance.imagery.active
    const input = viewer.screenSpaceEventHandler
    const previousClick = input.getInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK)
    const previousDoubleClick = input.getInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
    // Core PickService owns Earth interactions. Cesium's built-in selection
    // requests 3D-only imagery ray intersections when clicked in 2D.
    input.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK)
    input.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
    const visuals = {
      sky: viewer.scene.skyBox?.show,
      atmosphere: viewer.scene.skyAtmosphere?.show,
      sun: viewer.scene.sun?.show,
      background: viewer.scene.backgroundColor
    }
    if (viewer.scene.skyBox) viewer.scene.skyBox.show = false
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false
    if (viewer.scene.sun) viewer.scene.sun.show = false
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#080c10')
    restoreEnvironment = () => {
      if (viewer.isDestroyed()) return
      if (previousClick) input.setInputAction(previousClick, Cesium.ScreenSpaceEventType.LEFT_CLICK)
      if (previousDoubleClick)
        input.setInputAction(previousDoubleClick, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
      if (viewer.scene.skyBox && visuals.sky !== undefined) viewer.scene.skyBox.show = visuals.sky
      if (viewer.scene.skyAtmosphere && visuals.atmosphere !== undefined)
        viewer.scene.skyAtmosphere.show = visuals.atmosphere
      if (viewer.scene.sun && visuals.sun !== undefined) viewer.scene.sun.show = visuals.sun
      viewer.scene.backgroundColor = visuals.background
      instance.scene.setMode(previousMode, 0)
      if (previousMode === '3D') {
        if (previousOrthographic) viewer.camera.switchToOrthographicFrustum()
        else viewer.camera.switchToPerspectiveFrustum()
      }
      instance.camera.setView(previousView)
      instance.imagery.switchTo(previousBase)
      if (previousClock.startTime && previousClock.stopTime)
        instance.clock.setRange(previousClock.startTime, previousClock.stopTime)
      else instance.clock.clearRange()
      instance.clock.seek(previousClock.currentTime)
      instance.clock.setMultiplier(previousClock.multiplier)
      instance.clock.loop(previousClock.loop)
      if (previousClock.running) instance.clock.play()
      else instance.clock.pause()
    }
  }
  const revision = ++loadRevision
  initialRequest?.abort()
  initialRequest = new AbortController()
  loading.value = true
  errorText.value = ''
  pendingPlugin = null
  cancelled = false
  let pending: EarthPlugin | null = null
  try {
    const dataRef =
      dataset.value === 'real' ? '/data/earth/real/manifest.json' : '/data/earth/manifest.json'
    const parsed = await loadEarthManifest(dataRef, { signal: initialRequest.signal })
    if (cancelled || revision !== loadRevision) return
    manifest.value = parsed
    const route = readEarthRoute(
      dataset.value === 'real' ? window.location : { search: '', hash: '' },
      parsed
    )
    modeId.value = route.mode
    levelId.value = route.level
    syncAnnotationsFromMode()
    timeValue.value = new Date(parsed.range.start)
    const plugin = createEarthPlugin({
      data: parsed,
      dataRef,
      mode: modeId.value,
      level: levelId.value,
      vector: route.vector,
      overlay: route.overlay,
      followClock: true,
      syncClockRange: true,
      settings,
      weather: true,
      onProbe: (result) => {
        probe.value = result
        updateProbeMarker(result)
      },
      onHover: (result) => {
        hoveredProbe.value = result
      },
      onModeChange: (mode) => {
        modeId.value = mode.id
        syncAnnotationsFromMode()
        syncSelectionsFromPlugin()
      },
      onError: (key, error) => {
        errorText.value = `${key}：${errorMessage(error)}`
        ElMessage.warning(`${key} 加载失败：${errorMessage(error)}`)
      }
    })
    pending = plugin
    pendingPlugin = plugin
    await instance.features.register(plugin)
    if (cancelled || revision !== loadRevision) {
      instance.features.unregister(plugin.name)
      pendingPlugin = null
      return
    }
    earth.value = plugin
    pendingPlugin = null
    syncSelectionsFromPlugin()
    if (parsed.bounds) {
      instance.camera.setView({
        lon: 120,
        lat: 22,
        height: 16_000_000
      })
    }
    instance.clock.pause()
    onProjection(route.projection)
    if (route.mode === 'space' || route.mode === 'biology') viewMode(route.mode)
    instance.clock.loop(true)
    instance.clock.setMultiplier(speed.value)
    loading.value = false
    syncRoute()
  } catch (error) {
    if (pending && manager.value?.features.has(pending.name)) {
      manager.value.features.unregister(pending.name)
    }
    if (cancelled || revision !== loadRevision) return
    errorText.value = errorMessage(error)
    loading.value = false
    ElMessage.error(errorText.value)
  }
}

function updateProbeMarker(result: EarthProbeResult | null): void {
  const viewer = manager.value?.getViewer()
  if (!viewer) return
  if (probeMarker) viewer.entities.remove(probeMarker)
  probeMarker = result
    ? viewer.entities.add({
        id: 'earth-probe-marker',
        position: Cesium.Cartesian3.fromDegrees(result.lon, result.lat, 200),
        point: {
          pixelSize: 9,
          color: Cesium.Color.TRANSPARENT,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      })
    : undefined
  viewer.scene.requestRender()
}

function clearProbe(): void {
  probe.value = null
  updateProbeMarker(null)
}

async function switchDataset(): Promise<void> {
  compareRef.value?.stop()
  if (busy.value) return
  busy.value = true
  const instance = manager.value
  if (instance?.features.has('earth-plugin')) instance.features.unregister('earth-plugin')
  earth.value = null
  for (const key of Object.keys(weatherVisible) as WeatherKey[]) {
    weatherVisible[key] = false
    weatherStatus[key] = ''
    weatherBusy[key] = false
  }
  probe.value = null
  hoveredProbe.value = null
  updateProbeMarker(null)
  projection.value = '3D'
  instance?.scene.setMode('3D', 0)
  await enable()
  busy.value = false
}

function stepFrame(direction: -1 | 1): void {
  const times = frameTimes.value.map((value) => Date.parse(value))
  const now = currentTime.value.getTime()
  const target =
    direction > 0
      ? times.find((time) => time > now + 1000)
      : times
          .slice()
          .reverse()
          .find((time) => time < now - 1000)
  if (target !== undefined) onTimeChange(new Date(target))
}

function close(): void {
  cancelled = true
  const instance = manager.value
  const plugin = earth.value ?? pendingPlugin
  if (instance && plugin && instance.features.has(plugin.name)) {
    instance.features.unregister(plugin.name)
  }
  earth.value = null
  pendingPlugin = null
  emit('close')
}

async function onModeChange(value: EarthMode): Promise<void> {
  errorText.value = ''
  const plugin = earth.value
  if (!plugin || busy.value) return
  busy.value = true
  modeId.value = value
  levelId.value = activeMode.value?.defaultLevel ?? activeMode.value?.id ?? 'surface'
  overlayId.value = activeMode.value?.defaultOverlay ?? activeMode.value?.overlays[0]?.id ?? ''
  vectorId.value = activeMode.value?.defaultVector ?? activeMode.value?.vectors[0]?.id ?? ''
  syncAnnotationsFromMode()
  try {
    await plugin.setMode(value)
    modeId.value = plugin.mode?.id ?? value
    syncAnnotationsFromMode()
    syncSelectionsFromPlugin()
    if (dataset.value === 'real' && projection.value === '3D') onProjection('ORTHOGRAPHIC')
    viewMode(value)
    if (probe.value) probe.value = plugin.probe(probe.value.lon, probe.value.lat)
    if (hoveredProbe.value)
      hoveredProbe.value = plugin.probe(hoveredProbe.value.lon, hoveredProbe.value.lat)
  } catch (error) {
    ElMessage.error(`模式切换失败：${errorMessage(error)}`)
  } finally {
    busy.value = false
    syncRoute()
  }
}

async function onOverlayChange(value: string): Promise<void> {
  errorText.value = ''
  if (busy.value || loading.value) return
  busy.value = true
  try {
    overlayId.value = value
    await earth.value?.setOverlay(value || null)
    syncSelectionsFromPlugin()
    refreshProbe()
  } finally {
    busy.value = false
    syncRoute()
  }
}

async function onVectorChange(value: string): Promise<void> {
  errorText.value = ''
  if (busy.value || loading.value) return
  busy.value = true
  try {
    vectorId.value = value
    await earth.value?.setVector(value || null)
    syncSelectionsFromPlugin()
    refreshProbe()
  } finally {
    busy.value = false
    syncRoute()
  }
}

async function onLevelChange(id: string): Promise<void> {
  errorText.value = ''
  if (busy.value || !earth.value) return
  busy.value = true
  try {
    await earth.value.setLevel(id)
    syncSelectionsFromPlugin()
    refreshProbe()
  } finally {
    busy.value = false
    syncRoute()
  }
}

function onAnnotation(id: string, value: boolean): void {
  annotationVisible[id] = value
  void Promise.resolve(earth.value?.setAnnotation(id, value)).catch((error) =>
    ElMessage.error(errorMessage(error))
  )
}

async function onWeather(key: WeatherKey, value: boolean): Promise<void> {
  const plugin = earth.value
  if (!plugin || weatherBusy[key]) return
  weatherBusy[key] = true
  weatherStatus[key] = value ? '加载中…' : ''
  try {
    if (key === 'points') await plugin.setWeatherPointsVisible(value)
    else if (key === 'warnings') await plugin.setWeatherWarningsVisible(value)
    else await plugin.setWindFarmVisible(value)
    if (earth.value !== plugin) return
    weatherVisible[key] = value
    const count =
      key === 'points'
        ? plugin.weatherPoints?.points.length
        : key === 'warnings'
          ? plugin.weatherWarnings?.warnings.length
          : plugin.windFarm?.turbines.length
    weatherStatus[key] = value ? `已加载 ${count ?? 0} 个` : ''
  } catch (error) {
    if (earth.value !== plugin) return
    weatherVisible[key] = false
    weatherStatus[key] = '加载失败，可重试'
    ElMessage.error(`${weatherLabels[key]}加载失败：${errorMessage(error)}`)
  } finally {
    if (earth.value === plugin) weatherBusy[key] = false
  }
}

function locateWeather(key: WeatherKey): void {
  const plugin = earth.value
  if (!plugin || !manager.value) return
  let points: Array<{ lon: number; lat: number }> = []
  if (key === 'points') points = plugin.weatherPoints?.points ?? []
  else if (key === 'windFarm') points = plugin.windFarm?.turbines ?? []
  else {
    points = (plugin.weatherWarnings?.warnings ?? []).flatMap((warning) => {
      const polygons =
        warning.geometry.type === 'Polygon'
          ? [warning.geometry.coordinates]
          : warning.geometry.coordinates
      return polygons.flatMap((polygon) =>
        (polygon[0] ?? []).map((point) => ({ lon: point[0]!, lat: point[1]! }))
      )
    })
  }
  if (!points.length) {
    ElMessage.info('当前图层没有可定位的数据')
    return
  }
  const west = Math.min(...points.map((point) => point.lon))
  const east = Math.max(...points.map((point) => point.lon))
  const south = Math.min(...points.map((point) => point.lat))
  const north = Math.max(...points.map((point) => point.lat))
  manager.value.camera.setView({
    lon: (west + east) / 2,
    lat: (south + north) / 2,
    height: Math.max(1_200_000, Math.max(east - west, north - south) * 180_000)
  })
  controlsOpen.value = false
}

function onProjection(value: EarthProjection): void {
  projection.value = value
  earth.value?.setProjection(value)
  syncRoute()
}

function onTimeChange(value: Date | null): void {
  if (!value) return
  const range = fieldRange.value
  const bounded = range
    ? new Date(Math.min(range.end.getTime(), Math.max(range.start.getTime(), value.getTime())))
    : value
  timeValue.value = bounded
  earth.value?.setTime(bounded)
}

function onTimelineInput(value: string): void {
  const range = fieldRange.value
  if (!range) return
  const next = Number(value)
  timelineValue.value = next
  const time = new Date(
    range.start.getTime() + ((range.end.getTime() - range.start.getTime()) * next) / 100
  )
  onTimeChange(time)
}

function onFollowClock(value: boolean): void {
  followClock.value = value
  earth.value?.setFollowClock(value)
}

function onPlay(): void {
  if (frameTimes.value.length < 2) return
  onFollowClock(true)
  manager.value?.clock.setMultiplier(speed.value)
  manager.value?.clock.play()
}

function onPause(): void {
  manager.value?.clock.pause()
}

function onSpeed(value: number): void {
  speed.value = value
  manager.value?.clock.setMultiplier(value)
}

function onBaseMap(value: 'classic' | 'detailed'): void {
  baseMap.value = value
  manager.value?.imagery.switchTo(value === 'classic' ? 'naturalEarth' : 'osm')
}

function applySettings(): void {
  earth.value?.setSettings({ ...settings })
}

function resetView(): void {
  const data = manifest.value
  if (!data) return
  manager.value?.camera.setView({
    lon: (data.bounds.west + data.bounds.east) / 2,
    lat: (data.bounds.south + data.bounds.north) / 2,
    height: 16_000_000
  })
}

const speedOptions = [
  { value: 3600, label: '1 小时/秒' },
  { value: 21600, label: '6 小时/秒' },
  { value: 86400, label: '1 天/秒' }
]

function captureWorkspace(): EarthWorkspaceState {
  if (!earth.value || loading.value || busy.value) throw new Error('地球数据尚未就绪')
  const frustum = manager.value?.viewer.camera.frustum
  return {
    plugin: earth.value.getState(),
    point: probe.value ? { lon: probe.value.lon, lat: probe.value.lat } : null,
    drawer: activeDrawer.value,
    drawerOpen: controlsOpen.value,
    comparison: compareRef.value?.getState() ?? null,
    ...(frustum instanceof Cesium.OrthographicFrustum ? { frustumWidth: frustum.width } : {})
  }
}
async function restoreWorkspace(saved: EarthWorkspaceState) {
  await initialized
  if (
    !saved?.plugin ||
    !['/data/earth/real/manifest.json', '/data/earth/manifest.json'].includes(saved.plugin.dataRef)
  )
    throw new Error('场景数据集未配置')
  const nextDataset = saved.plugin.dataRef.includes('/real/') ? 'real' : 'sample'
  if (dataset.value !== nextDataset) {
    dataset.value = nextDataset
    await switchDataset()
  }
  if (!earth.value) throw new Error('地球插件未就绪')
  await earth.value.restoreState(saved.plugin)
  modeId.value = saved.plugin.mode
  projection.value = saved.plugin.projection
  Object.assign(settings, saved.plugin.settings)
  Object.assign(weatherVisible, saved.plugin.weather)
  manifest.value?.annotations.forEach((item) => {
    annotationVisible[item.id] = saved.plugin.annotations.includes(item.id)
  })
  syncSelectionsFromPlugin()
  probe.value = saved.point ? earth.value.probe(saved.point.lon, saved.point.lat) : null
  updateProbeMarker(probe.value)
  activeDrawer.value = ['layers', 'settings', 'points', 'data', 'analysis'].includes(saved.drawer)
    ? saved.drawer
    : 'layers'
  controlsOpen.value = saved.drawerOpen
  await nextTick()
  await compareRef.value?.restore(saved.comparison)
  syncRoute()
}
function finishRestore(saved: EarthWorkspaceState) {
  const view = manager.value?.camera.getView()
  earth.value?.setProjection(saved.plugin.projection)
  if (view) manager.value?.camera.setView(view, view)
  const frustum = manager.value?.viewer.camera.frustum
  if (frustum instanceof Cesium.OrthographicFrustum && Number.isFinite(saved.frustumWidth))
    frustum.width = saved.frustumWidth!
}
async function saveWorkspace(local = false) {
  try {
    const result = local ? manager.value?.snapshots.saveLocal() : manager.value?.snapshots.capture()
    if (result && !local) saveFile('scene.json', JSON.stringify(result.snapshot, null, 2))
    ElMessage.success(`场景已保存；跳过 ${result?.skipped.length ?? 0} 项`)
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}
async function restoreLocalScene() {
  try {
    const report = await manager.value?.snapshots.restoreLocal()
    ElMessage.info(
      `恢复完成；失败 ${report?.failed.length ?? 0}，跳过 ${report?.skipped.length ?? 0}`
    )
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}
async function restoreFile(event: Event) {
  const input = event.target as HTMLInputElement
  try {
    const file = input.files?.[0]
    if (!file) return
    const report = await manager.value?.snapshots.restore(await file.text())
    ElMessage.info(
      `恢复完成；失败 ${report?.failed.length ?? 0}，跳过 ${report?.skipped.length ?? 0}`
    )
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    input.value = ''
  }
}
async function retryLayers() {
  if (!earth.value) {
    await enable()
    return
  }
  busy.value = true
  try {
    sharedDataRepository.clear()
    await earth.value.setOverlay(overlayId.value || null)
    await earth.value.setVector(vectorId.value || null)
    errorText.value = Object.values(earth.value.errors).map(errorMessage).join('；')
  } finally {
    busy.value = false
  }
}
defineExpose({ captureWorkspace, restoreWorkspace, finishRestore, whenReady: () => initialized })

onMounted(async () => {
  document.addEventListener('keydown', escapeDrawer, true)
  try {
    await whenReady()
    if (!cancelled) await enable()
  } catch (error) {
    if (!cancelled) {
      loading.value = false
      errorText.value = errorMessage(error)
    }
  } finally {
    readyResolve()
  }
})

watch(timeProgress, (value) => {
  timelineValue.value = value
  timeValue.value = currentTime.value
  if (probe.value && earth.value) probe.value = earth.value.probe(probe.value.lon, probe.value.lat)
  if (hoveredProbe.value && earth.value)
    hoveredProbe.value = earth.value.probe(hoveredProbe.value.lon, hoveredProbe.value.lat)
})

onBeforeUnmount(() => {
  clearInterval(statusTimer)
  document.removeEventListener('keydown', escapeDrawer, true)
  initialRequest?.abort()
  loadRevision++
  compareRef.value?.stop()
  updateProbeMarker(null)
  cancelled = true
  const instance = manager.value
  const plugin = earth.value ?? pendingPlugin
  if (instance && plugin && instance.features.has(plugin.name)) {
    instance.features.unregister(plugin.name)
  }
  earth.value = null
  pendingPlugin = null
  restoreEnvironment?.()
})
</script>

<template>
  <div
    class="earth-panel-wrap"
    :class="[`drawer-${activeDrawer}`, { 'drawer-open': controlsOpen }]"
  >
    <div class="earth-hud earth-hud-top">
      <div class="earth-brand-mark">
        <span class="earth-brand-dot" />
        <span>EARTH / {{ activeMode?.label ?? 'GLOBAL' }}</span>
      </div>
      <div class="earth-hud-status mono">
        {{ formatTime(currentTime) }} UTC+8 ·
        {{ activeOverlay?.label ?? (loading ? '数据加载中' : '仅矢量') }}
      </div>
      <div class="earth-hud-actions">
        <el-button
          :icon="InfoFilled"
          circle
          text
          title="显示当前数据"
          aria-label="显示当前数据"
          @click="toggleData"
        />
        <el-button
          :icon="controlsOpen ? Expand : Menu"
          circle
          text
          title="切换控制面板"
          aria-label="切换控制面板"
          @click="openDrawer(activeDrawer)"
        />
        <el-button
          :icon="Close"
          circle
          text
          title="退出地球模式"
          aria-label="退出地球模式"
          @click="close"
        />
      </div>
    </div>

    <div v-if="manifest" class="earth-mode-strip">
      <button
        v-for="mode in manifest.modes"
        :key="mode.id"
        class="earth-mode-chip"
        :class="{ active: mode.id === modeId }"
        :disabled="busy || loading"
        type="button"
        @click="onModeChange(mode.id)"
      >
        {{ mode.label }}
      </button>
    </div>

    <nav
      v-show="controlsOpen && ['layers', 'settings', 'analysis'].includes(activeDrawer)"
      class="earth-sidebar-tabs"
      aria-label="地球侧栏"
    >
      <button
        v-for="tab in [
          { id: 'layers', label: '图层' },
          { id: 'settings', label: '设置' },
          { id: 'analysis', label: '分析' }
        ]"
        :key="tab.id"
        type="button"
        :aria-pressed="activeDrawer === tab.id"
        @click="activeDrawer = tab.id"
      >
        {{ tab.label }}
      </button>
      <button type="button" aria-label="关闭侧栏" @click="closeDrawer">×</button>
    </nav>

    <section
      v-if="manifest && !loading"
      v-show="controlsOpen && activeDrawer === 'layers'"
      class="earth-catalog"
      aria-label="地球图层目录"
    >
      <button
        class="earth-catalog-heading"
        type="button"
        :aria-expanded="catalogOpen"
        @click="catalogOpen = !catalogOpen"
      >
        <span
        >图层目录
          <small>{{ activeMode?.label }} / {{ activeOverlay?.label ?? '仅动画' }}</small></span
        >
        <span>{{ catalogOpen ? '收起 −' : '展开 +' }}</span>
      </button>
      <div v-show="catalogOpen" class="earth-catalog-content">
        <div class="earth-catalog-row">
          <span class="earth-catalog-label">模式</span>
          <div class="earth-catalog-options" role="group" aria-label="数据模式">
            <button
              v-for="mode in manifest.modes"
              :key="mode.id"
              type="button"
              :aria-pressed="modeId === mode.id"
              :disabled="busy"
              @click="onModeChange(mode.id)"
            >
              {{ mode.label }}
            </button>
          </div>
        </div>
        <div v-if="activeMode?.levels?.length" class="earth-catalog-row">
          <span class="earth-catalog-label">高度</span>
          <div class="earth-catalog-options" role="group" aria-label="大气高度">
            <button
              v-for="level in activeMode.levels"
              :key="level.id"
              type="button"
              :aria-pressed="levelId === level.id"
              :disabled="busy"
              @click="onLevelChange(level.id)"
            >
              {{ level.label }}
            </button>
          </div>
        </div>
        <div class="earth-catalog-row">
          <span class="earth-catalog-label">动画</span>
          <div class="earth-catalog-options" role="group" aria-label="动画类型">
            <button
              type="button"
              :aria-pressed="!vectorId"
              :disabled="busy"
              @click="onVectorChange('')"
            >
              关闭
            </button>
            <button
              v-for="vector in vectors"
              :key="vector.id"
              type="button"
              :aria-pressed="vectorId === vector.id"
              :disabled="busy"
              @click="onVectorChange(vector.id)"
            >
              {{ vector.label }}
            </button>
          </div>
        </div>
        <div class="earth-catalog-row">
          <span class="earth-catalog-label">叠加层</span>
          <div class="earth-catalog-options" role="group" aria-label="叠加图层">
            <button
              v-for="overlay in overlays"
              :key="overlay.id"
              type="button"
              :aria-pressed="overlayId === overlay.id"
              :disabled="busy"
              @click="onOverlayChange(overlay.id)"
            >
              {{ overlay.label }}
            </button>
            <button
              type="button"
              :aria-pressed="!overlayId"
              :disabled="busy"
              @click="onOverlayChange('')"
            >
              无叠加层
            </button>
          </div>
        </div>
        <div class="earth-catalog-row">
          <span class="earth-catalog-label">投影</span>
          <div class="earth-catalog-options" role="group" aria-label="地图投影">
            <button
              v-for="view in [
                { id: 'ORTHOGRAPHIC', label: '正交球面' },
                { id: '3D', label: '透视球面' },
                { id: '2D', label: '等距平面' },
                { id: 'COLUMBUS_VIEW', label: '哥伦布' }
              ] as const"
              :key="view.id"
              type="button"
              :aria-pressed="projection === view.id"
              :disabled="busy"
              @click="onProjection(view.id)"
            >
              {{ view.label }}
            </button>
          </div>
        </div>
        <div v-if="modeId === 'biology' && manifest.annotations.length" class="earth-catalog-row">
          <span class="earth-catalog-label">注释</span>
          <div class="earth-catalog-options" role="group" aria-label="生物注释">
            <button
              v-for="annotation in manifest.annotations"
              :key="annotation.id"
              type="button"
              :aria-pressed="annotationVisible[annotation.id] ?? false"
              :disabled="busy"
              @click="onAnnotation(annotation.id, !annotationVisible[annotation.id])"
            >
              {{ annotation.label }}
            </button>
          </div>
        </div>
        <p class="earth-catalog-note">
          {{
            busy
              ? '正在加载图层…'
              : '真实离线快照 · 每个图层保留原始有效时间 · 链接可直接打开当前视图'
          }}
        </p>
      </div>
    </section>

    <section
      v-show="controlsOpen && activeDrawer === 'settings'"
      class="earth-panel"
      :class="panelClass"
    >
      <header class="earth-head">
        <div>
          <div class="earth-title">地球可视化</div>
          <div class="earth-sub mono">{{ manifest?.name ?? 'Global Earth' }}</div>
        </div>
        <div class="earth-actions">
          <el-button
            :icon="Location"
            size="small"
            text
            title="重置视角"
            aria-label="重置视角"
            @click="resetView"
          />
          <el-button
            :icon="Close"
            size="small"
            text
            title="退出地球模式"
            aria-label="退出地球模式"
            @click="close"
          />
        </div>
      </header>

      <p v-if="errorText" class="earth-error">
        {{ errorText }} <el-button size="small" @click="retryLayers">重试加载</el-button>
      </p>
      <div v-if="loading" class="earth-loading">正在加载地球数据…</div>

      <div v-else class="earth-scroll">
        <div class="earth-save-actions">
          <el-button size="small" @click="saveWorkspace()">导出场景</el-button
          ><el-button size="small" @click="saveWorkspace(true)">保存到本地</el-button
          ><el-button size="small" @click="sceneInput?.click()">导入场景</el-button>
        </div>
        <input
          ref="sceneInput"
          type="file"
          accept=".json"
          hidden
          aria-label="导入地球场景"
          @change="restoreFile"
        />
        <el-button size="small" @click="restoreLocalScene">恢复本地场景</el-button>
        <EarthCompare
          v-if="earth && manager"
          ref="compareRef"
          :manager="manager"
          :primary-state="() => earth!.getState()"
        />
        <div class="earth-block">
          <div class="earth-label">数据集</div>
          <el-select
            v-model="dataset"
            :disabled="loading || busy"
            aria-label="数据集"
            @change="switchDataset"
          >
            <el-option value="real" label="真实全球数据 · 六种模式" />
            <el-option value="sample" label="合成样例 · 六种模式" />
          </el-select>
          <p class="earth-meta">{{ fieldSource }}</p>
          <p v-if="fieldMetadata" class="earth-meta">
            {{ fieldMetadata.level }} · {{ fieldMetadata.width }} × {{ fieldMetadata.height }} ·
            {{ fieldMetadata.times.length }} 个预报时刻
          </p>
        </div>
        <div class="earth-block">
          <div class="earth-label">模式</div>
          <el-radio-group
            :model-value="modeId"
            :disabled="busy || loading"
            size="small"
            @update:model-value="onModeChange($event as EarthMode)"
          >
            <el-radio-button v-for="mode in manifest?.modes ?? []" :key="mode.id" :value="mode.id">
              {{ mode.label }}
            </el-radio-button>
          </el-radio-group>
        </div>

        <div class="earth-grid-2">
          <div>
            <div class="earth-label">矢量场</div>
            <el-select
              :model-value="vectorId"
              size="small"
              :disabled="vectors.length === 0 || busy"
              @update:model-value="onVectorChange(String($event))"
            >
              <el-option value="" label="无流线 · 仅浓度色层" />
              <el-option
                v-for="vector in vectors"
                :key="vector.id"
                :value="vector.id"
                :label="vector.label"
              />
            </el-select>
          </div>
          <div>
            <div class="earth-label">叠加层</div>
            <el-select
              :model-value="overlayId"
              size="small"
              :disabled="overlays.length === 0 || busy"
              @update:model-value="onOverlayChange(String($event))"
            >
              <el-option value="" label="无叠加层" />
              <el-option
                v-for="overlay in overlays"
                :key="overlay.id"
                :value="overlay.id"
                :label="overlay.label"
              />
            </el-select>
          </div>
        </div>

        <div v-if="projection === '2D' || projection === 'COLUMBUS_VIEW'" class="earth-note">
          当前投影支持连续风场轨迹，可继续拖动、缩放和点查。
        </div>

        <div class="earth-block">
          <div class="earth-label">投影</div>
          <el-radio-group
            :model-value="projection"
            size="small"
            @update:model-value="onProjection($event as EarthProjection)"
          >
            <el-radio-button value="3D">球面</el-radio-button>
            <el-radio-button value="ORTHOGRAPHIC">正交球面</el-radio-button>
            <el-radio-button value="2D">平面</el-radio-button>
            <el-radio-button value="COLUMBUS_VIEW">哥伦布</el-radio-button>
          </el-radio-group>
        </div>

        <div class="earth-block">
          <div class="earth-label">时间</div>
          <el-date-picker
            :model-value="timeValue"
            type="datetime"
            size="small"
            @update:model-value="onTimeChange($event as Date | null)"
          />
          <div class="earth-row time-row">
            <el-button-group size="small">
              <el-button :icon="VideoPlay" :disabled="frameTimes.length < 2" @click="onPlay">
                播放
              </el-button>
              <el-button :icon="VideoPause" @click="onPause">暂停</el-button>
            </el-button-group>
            <el-select
              :model-value="speed"
              size="small"
              @update:model-value="onSpeed(Number($event))"
            >
              <el-option
                v-for="item in speedOptions"
                :key="item.value"
                :value="item.value"
                :label="item.label"
              />
            </el-select>
          </div>
          <div class="earth-row">
            <span class="earth-meta mono">{{ formatTime(currentTime) }}</span>
            <el-switch
              :model-value="followClock"
              size="small"
              active-text="跟随时间轴"
              inline-prompt
              @update:model-value="onFollowClock(Boolean($event))"
            />
          </div>
        </div>

        <div class="earth-block">
          <div class="earth-row">
            <span class="earth-label">当前叠加层</span>
            <span class="earth-meta mono">{{ activeOverlay?.unit ?? '' }}</span>
          </div>
          <div class="earth-legend" :style="legendStyle" />
          <div class="earth-legend-labels mono">
            <span v-for="(tick, index) in legendTicks" :key="index">{{ tick }}</span>
          </div>
        </div>

        <div class="earth-block">
          <div class="earth-label">注释</div>
          <div class="earth-switch-list">
            <div
              v-for="annotation in manifest?.annotations ?? []"
              :key="annotation.id"
              class="earth-switch-row"
            >
              <span>{{ annotation.label }}</span>
              <el-switch
                :model-value="annotationVisible[annotation.id] ?? false"
                size="small"
                @update:model-value="onAnnotation(annotation.id, Boolean($event))"
              />
            </div>
            <p v-if="manifest?.weather?.sample" class="earth-meta earth-business-note">
              城市预报、气象预警和风电场为合成业务样例。
              <template v-if="manifest.weather.sampleTime">
                业务演示时间：{{ formatTime(manifest.weather.sampleTime) }}，与 GFS 风场时间独立。
              </template>
            </p>
            <div
              v-for="key in ['points', 'warnings', 'windFarm'] as const"
              :key="key"
              class="earth-switch-row earth-weather-row"
              :data-weather="key"
            >
              <span
              >{{ weatherLabels[key] }}
                <small v-if="weatherStatus[key]">{{ weatherStatus[key] }}</small></span
              >
              <el-button
                v-if="weatherVisible[key]"
                text
                size="small"
                :aria-label="`定位${weatherLabels[key]}`"
                @click="locateWeather(key)"
              >
                定位
              </el-button>
              <el-switch
                :model-value="weatherVisible[key]"
                :aria-label="weatherLabels[key]"
                :loading="weatherBusy[key]"
                :disabled="busy || loading || !manifest?.weather?.[weatherSources[key]]"
                size="small"
                @update:model-value="onWeather(key, Boolean($event))"
              />
            </div>
          </div>
        </div>

        <div class="earth-block">
          <div class="earth-label">点查</div>
          <div v-if="probe" class="earth-probe">
            <div class="mono">{{ probe.lon.toFixed(3) }}, {{ probe.lat.toFixed(3) }}</div>
            <div v-if="probe.vector">
              矢量：{{ probe.vector.speed.toFixed(1) }} {{ probe.vector.unit }} ·
              {{ Math.round(probe.vector.direction) }}°
            </div>
            <div v-if="probe.overlay">
              数值：{{ formatNumber(probe.overlay.value) }} {{ probe.overlay.unit }}
            </div>
            <div v-if="probe.annotations.length > 0">
              注释：{{ probe.annotations.map((item) => item.label).join('、') }}
            </div>
            <div v-if="!probe.overlay && !probe.vector">当前点无可用数据</div>
          </div>
          <div v-else class="earth-meta">点击地图查看当前矢量场与叠加层数值</div>
        </div>

        <div class="earth-block">
          <div class="earth-label">
            <el-icon><Setting /></el-icon> 设置
          </div>
          <div class="earth-settings">
            <div class="earth-control-field">
              <label for="flow-density"
              >流线密度 <span>{{ flowDensity }}</span></label
              >
              <input
                id="flow-density"
                v-model.number="flowDensity"
                type="range"
                min="64"
                max="256"
                step="32"
              />
            </div>
            <div class="earth-control-field">
              <label for="flow-speed"
              >流动速度 <span>{{ flowSpeed }}×</span></label
              >
              <input
                id="flow-speed"
                v-model.number="flowSpeed"
                type="range"
                min="0.5"
                max="4"
                step="0.5"
              />
            </div>
            <div class="earth-control-field">
              <label for="overlay-opacity"
              >叠加透明度 <span>{{ Math.round(overlayOpacity * 100) }}%</span></label
              >
              <input
                id="overlay-opacity"
                v-model.number="overlayOpacity"
                type="range"
                min="0"
                max="1"
                step="0.05"
              />
            </div>
            <div class="earth-row">
              <span>底图</span>
              <el-radio-group
                :model-value="baseMap"
                size="small"
                @update:model-value="onBaseMap($event as 'classic' | 'detailed')"
              >
                <el-radio-button value="classic">经典</el-radio-button>
                <el-radio-button value="detailed">详细</el-radio-button>
              </el-radio-group>
            </div>
            <div class="earth-row">
              <span>网格</span>
              <el-switch v-model="settings.grid" size="small" @change="applySettings" />
            </div>
            <div class="earth-row">
              <span>高清</span>
              <el-switch v-model="settings.hd" size="small" @change="applySettings" />
            </div>
            <div class="earth-row">
              <span>动画</span>
              <el-switch v-model="settings.dynamic" size="small" @change="applySettings" />
            </div>
            <div class="earth-row">
              <span>插值</span>
              <el-radio-group v-model="settings.interpolation" size="small" @change="applySettings">
                <el-radio-button value="bilinear">双线性</el-radio-button>
                <el-radio-button value="nearest">最近</el-radio-button>
              </el-radio-group>
            </div>
            <div class="earth-row">
              <span>字体</span>
              <el-select v-model="settings.fontScale" size="small" @change="applySettings">
                <el-option value="small" label="小" />
                <el-option value="normal" label="中" />
                <el-option value="large" label="大" />
              </el-select>
            </div>
            <div class="earth-row">
              <span>粗体</span>
              <el-switch v-model="settings.bold" size="small" @change="applySettings" />
            </div>
            <div class="earth-row">
              <span>信息栏</span>
              <el-switch v-model="settings.infoBar" size="small" @change="applySettings" />
            </div>
          </div>
        </div>

        <div v-if="settings.infoBar" class="earth-info">
          <span>{{ activeMode?.label }} / {{ activeOverlay?.label ?? '无叠加层' }}</span>
          <span class="mono">{{ fieldSource }}</span>
          <span class="mono">{{ formatTime(currentTime) }}</span>
        </div>
      </div>
    </section>

    <section
      v-if="earth && controlsOpen && activeDrawer === 'analysis'"
      class="earth-analysis-panel"
    >
      <EarthAnalysis
        :plugin="earth"
        :point="probe"
        :selection="`${modeId}:${levelId}:${overlayId}:${vectorId}`"
      />
    </section>
    <div v-if="loading || busy || errorText" class="earth-global-status" role="status">
      <span>{{ loading || busy ? '正在加载地球数据…' : errorText }}</span>
      <button v-if="!loading && !busy" type="button" @click="retryLayers">重试加载</button>
    </div>
    <aside v-if="!loading && settings.infoBar" class="earth-data-card">
      <div class="earth-data-kicker">
        {{
          dataset === 'real'
            ? isPm25
              ? 'CAMS / 真实颗粒物预报'
              : `${productProvider} / 真实预报快照`
            : 'SYNTHETIC / 合成样例'
        }}
      </div>
      <strong
      >{{ activeOverlay?.label ?? '无叠加层' }} <span>{{ activeOverlay?.unit }}</span></strong
      >
      <div class="earth-legend" :style="legendStyle" />
      <div class="earth-legend-labels mono">
        <span v-for="(tick, index) in legendTicks" :key="index">{{ tick }}</span>
      </div>
      <p v-if="fieldMetadata">{{ gridLabel }} · {{ fieldMetadata.level }}</p>
      <p>{{ fieldSource }}</p>
      <p v-if="isPm25">对数色阶 · 蓝色低浓度 → 黄红色高浓度</p>
      <p v-if="dataset === 'real'">色层有效时间 {{ formatTime(sampledTime) }} · 离线预报</p>
      <p v-if="activeVector">
        动画：{{ activeVector.label }} · {{ activeVector.metadata?.source }}
      </p>
      <p v-if="vectorTime">动画有效时间 {{ formatTime(vectorTime) }}</p>
      <p v-if="frameTimes.length === 1">本图层仅收录 1 帧；可切换其他叠加层。</p>
      <p>UTC+8 · 离线快照，不代表实时观测</p>
      <p v-if="fieldMetadata?.publishedAt">
        发布时间 {{ formatTime(new Date(fieldMetadata.publishedAt)) }}
      </p>
      <p v-if="actualSampledTime">实际显示 {{ formatTime(actualSampledTime) }}</p>
      <el-button size="small" :disabled="busy" @click="retryLayers">重新加载</el-button>
      <details class="earth-diagnostics">
        <summary>加载详情</summary>
        <p>缓存 {{ (cacheStats.bytes / 1048576).toFixed(1) }} / 128 MiB</p>
        <p v-for="item in diagnostics.slice(-6)" :key="item.key">
          {{ item.key }} · {{ item.status }} ·
          {{ item.cacheHit ? '缓存命中' : `${item.durationMs.toFixed(0)} ms` }} {{ item.error }}
        </p>
      </details>
    </aside>

    <aside v-if="probe" class="earth-readout-card">
      <div class="earth-data-kicker">
        {{ probe ? '固定点查' : '鼠标采样' }}
        <button v-if="probe" type="button" aria-label="取消固定点查" @click="clearProbe">×</button>
      </div>
      <div class="mono">
        {{ Math.abs(probe.lat).toFixed(2) }}°{{ probe.lat >= 0 ? 'N' : 'S' }} ·
        {{ Math.abs(probe.lon).toFixed(2) }}°{{ probe.lon >= 0 ? 'E' : 'W' }}
      </div>
      <div v-if="probe?.vector" class="earth-wind-value">
        <span class="earth-direction" :style="{ transform: `rotate(${probe.vector.direction}deg)` }"
        >↑</span
        >
        {{ probe.vector.speed.toFixed(1) }} <small>{{ probe.vector.unit }}</small>
      </div>
      <div v-if="probe?.vector" class="earth-meta">
        {{
          activeVector?.kind === 'waves'
            ? '波向与周期（非风速）'
            : activeVector?.kind === 'currents'
              ? '海流速度（非风速）'
              : '风速'
        }}
        · 去向 {{ Math.round(probe.vector.direction) }}° · 来向
        {{ Math.round((probe.vector.direction + 180) % 360) }}°
      </div>
      <div v-if="probe?.overlay" class="earth-meta">
        {{ activeOverlay?.label }} {{ formatNumber(probe.overlay.value) }}
        {{ probe.overlay.unit }}
        <span v-if="activeOverlay?.categories">
          · {{ activeOverlay.categories[Math.round(probe.overlay.value)] }}</span
        >
      </div>
      <el-button size="small" @click="showAnalysis"> 查看时间曲线 </el-button>
    </aside>

    <aside
      v-if="!probe && controlsOpen && activeDrawer === 'points'"
      class="earth-readout-card earth-empty-point"
    >
      点击地图固定一个点位，可查看数值与时间曲线。
    </aside>
    <div v-if="hoveredProbe && !probe" class="earth-hover-readout">
      {{ hoveredProbe.lon.toFixed(2) }}°, {{ hoveredProbe.lat.toFixed(2) }}° ·
      {{ hoveredProbe.overlay?.value.toFixed(1) ?? hoveredProbe.vector?.speed.toFixed(1) ?? '-' }}
      {{ hoveredProbe.overlay?.unit ?? hoveredProbe.vector?.unit }}
    </div>
    <div v-if="!controlsOpen && settings.infoBar && activeOverlay" class="earth-mini-legend">
      <button type="button" aria-label="关闭图例" @click="settings.infoBar = false">×</button>
      {{ activeOverlay.label }} · {{ activeOverlay.unit }}
      <div class="earth-legend" :style="legendStyle" />
      <span>{{ activeOverlay.min }} — {{ activeOverlay.max }}</span>
    </div>
    <nav class="earth-mobile-tabs" aria-label="地球抽屉">
      <button
        v-for="tab in [
          { id: 'layers', label: '图层' },
          { id: 'points', label: '点查' },
          { id: 'data', label: '数据' },
          { id: 'analysis', label: '分析' }
        ]"
        :key="tab.id"
        type="button"
        :aria-expanded="controlsOpen && activeDrawer === tab.id"
        @click="openDrawer(tab.id)"
      >
        {{ tab.label }}
      </button>
    </nav>
    <div class="earth-hud earth-hud-bottom">
      <div class="earth-play-control">
        <button
          type="button"
          class="earth-menu-toggle"
          :aria-expanded="controlsOpen"
          @click="openDrawer(activeDrawer)"
        >
          earth <span>{{ controlsOpen ? '−' : '+' }}</span>
        </button>
        <button
          type="button"
          class="earth-step"
          aria-label="上一预报时刻"
          :disabled="frameTimes.length < 2"
          @click="stepFrame(-1)"
        >
          ‹
        </button>
        <el-button
          :icon="VideoPlay"
          :disabled="frameTimes.length < 2"
          circle
          text
          title="播放时间"
          aria-label="播放时间"
          @click="onPlay"
        />
        <el-button
          :icon="VideoPause"
          circle
          text
          title="暂停时间"
          aria-label="暂停时间"
          @click="onPause"
        />
        <button
          type="button"
          class="earth-step"
          aria-label="下一预报时刻"
          :disabled="frameTimes.length < 2"
          @click="stepFrame(1)"
        >
          ›
        </button>
      </div>
      <div class="earth-timeline">
        <div class="earth-timeline-label mono">{{ formatTime(fieldRange?.start) }}</div>
        <input
          class="earth-range"
          type="range"
          min="0"
          max="100"
          :disabled="frameTimes.length < 2"
          step="0.1"
          :value="timelineValue"
          aria-label="时间轴"
          @input="onTimelineInput(($event.target as HTMLInputElement).value)"
        />
        <div class="earth-timeline-label mono">{{ formatTime(fieldRange?.end) }}</div>
      </div>
      <div class="earth-current-readout mono">
        <span>{{ formatTime(currentTime) }} UTC+8</span>
        <span v-if="probe">{{ probe.lon.toFixed(1) }}°, {{ probe.lat.toFixed(1) }}°</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.earth-panel-wrap {
  position: absolute;
  inset: 0;
  z-index: 30;
  pointer-events: none;
}

.earth-catalog {
  position: absolute;
  pointer-events: auto;
  left: 20px;
  bottom: 84px;
  width: min(620px, calc(100vw - 350px));
  max-height: 44vh;
  overflow: auto;
  color: #dce5ee;
  background: #080e15ed;
  backdrop-filter: blur(14px);
  border: 1px solid #ffffff26;
  border-radius: 7px;
  font-size: 12px;
}
.earth-catalog-heading {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  color: #b7ebde;
  padding: 12px 14px;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
}
.earth-catalog-heading small {
  color: #8fa4b3;
  margin-left: 8px;
}
.earth-catalog-content {
  padding: 0 12px 8px;
}
.earth-catalog-row {
  display: flex;
  gap: 12px;
  border-top: 1px solid #ffffff0d;
  padding: 8px 0;
}
.earth-catalog-label {
  width: 40px;
  flex: 0 0 40px;
  color: #78929f;
  padding-top: 5px;
}
.earth-catalog-options {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.earth-catalog-options button {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: #a8bdc9;
  font: inherit;
  padding: 4px 7px;
  cursor: pointer;
}
.earth-catalog-options button[aria-pressed='true'] {
  color: #d1fff0;
  border-color: #57c8a75e;
  background: #3cb59424;
}
.earth-catalog-options button:hover {
  color: white;
  background: #ffffff12;
}
.earth-catalog-options button:disabled {
  opacity: 0.5;
  cursor: wait;
}
.earth-catalog-note {
  margin: 6px 0;
  color: #6b8695;
  font-size: 10px;
}

.earth-panel {
  pointer-events: auto;
  position: absolute;
  top: 120px;
  left: 20px;
  bottom: 84px;
  width: 350px;
  max-width: calc(100vw - 40px);
  display: flex;
  flex-direction: column;
  height: auto;
  padding: 14px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(8, 12, 20, 0.84);
  backdrop-filter: blur(18px);
  box-shadow: 0 16px 42px rgba(0, 0, 0, 0.4);
  color: #e5e7eb;
  font-size: 14px;
}

.earth-control-field {
  margin-bottom: 12px;
}
.earth-control-field label {
  display: flex;
  justify-content: space-between;
  color: #9ca3af;
  font-size: 12px;
}
.earth-control-field input {
  width: 100%;
  accent-color: #6fceab;
}
.earth-data-card,
.earth-readout-card {
  pointer-events: auto;
  position: absolute;
  right: 20px;
  width: 270px;
  padding: 16px;
  color: #e2e8f0;
  border: 1px solid #ffffff24;
  border-radius: 6px;
  background: #080c14bd;
  backdrop-filter: blur(12px);
}
.earth-data-card {
  bottom: 84px;
}
.earth-readout-card {
  top: 72px;
}
.earth-data-card strong {
  display: block;
  font-size: 18px;
  margin: 8px 0 12px;
}
.earth-data-card strong span {
  color: #9ca3af;
  font-size: 11px;
  font-weight: 400;
}
.earth-data-card p {
  margin: 8px 0 0;
  font-size: 10px;
  line-height: 1.5;
  color: #94a3b8;
}
.earth-data-kicker {
  display: flex;
  justify-content: space-between;
  color: #77d6b7;
  font-size: 10px;
  letter-spacing: 1px;
  margin-bottom: 10px;
}
.earth-data-kicker button {
  color: #94a3b8;
  border: 0;
  background: none;
  cursor: pointer;
}
.earth-wind-value {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 28px;
  margin: 12px 0;
}
.earth-wind-value small {
  color: #94a3b8;
  font-size: 12px;
}
.earth-direction {
  display: inline-block;
  font-size: 26px;
  color: #77d6b7;
}
.earth-menu-toggle,
.earth-step {
  background: none;
  border: 0;
  color: #e2e8f0;
  cursor: pointer;
}
.earth-menu-toggle {
  font-size: 22px;
  letter-spacing: -1px;
  margin-right: 12px;
}
.earth-menu-toggle span {
  font-size: 16px;
  color: #77d6b7;
}
.earth-step {
  font-size: 24px;
}
.earth-step:disabled {
  opacity: 0.25;
  cursor: default;
}

.earth-hud {
  pointer-events: auto;
  position: absolute;
  z-index: 2;
  display: flex;
  align-items: center;
  color: #e2e8f0;
  background: rgba(8, 12, 20, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(14px);
}

.earth-hud-top {
  top: 18px;
  left: 20px;
  right: 20px;
  min-height: 42px;
  justify-content: space-between;
  padding: 0 8px 0 14px;
  border-radius: 6px;
}

.earth-brand-mark {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 12px;
  letter-spacing: 1.8px;
  font-weight: 700;
}

.earth-brand-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4ade80;
  box-shadow: 0 0 12px rgba(74, 222, 128, 0.8);
}

.earth-hud-status {
  margin-left: auto;
  margin-right: 14px;
  color: #94a3b8;
  font-size: 11px;
}

.earth-hud-actions {
  display: flex;
  gap: 2px;
}

.earth-hud-actions :deep(.el-button),
.earth-play-control :deep(.el-button) {
  color: #cbd5e1;
}

.earth-mode-strip {
  pointer-events: auto;
  position: absolute;
  top: 72px;
  left: 20px;
  z-index: 2;
  display: flex;
  gap: 4px;
  max-width: calc(100vw - 40px);
  overflow-x: auto;
  padding: 4px;
  border-radius: 6px;
  background: rgba(8, 12, 20, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(12px);
}

.earth-mode-chip {
  flex: 0 0 auto;
  padding: 6px 10px;
  border: 0;
  border-radius: 4px;
  color: #94a3b8;
  background: transparent;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.earth-mode-chip:hover,
.earth-mode-chip.active {
  color: #f8fafc;
  background: rgba(56, 189, 248, 0.24);
}

.earth-hud-bottom {
  left: 20px;
  right: 20px;
  bottom: 18px;
  min-height: 48px;
  gap: 12px;
  padding: 5px 12px;
  border-radius: 6px;
}

.earth-play-control {
  display: flex;
  flex: 0 0 auto;
}

.earth-timeline {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 100px;
}

.earth-timeline-label {
  color: #64748b;
  font-size: 10px;
  white-space: nowrap;
}

.earth-range {
  flex: 1;
  min-width: 60px;
  accent-color: #38bdf8;
}

.earth-current-readout {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  min-width: 144px;
  color: #cbd5e1;
  font-size: 10px;
}

.earth-panel.earth-font-small {
  font-size: 12px;
}

.earth-panel.earth-font-large {
  font-size: 16px;
}

.earth-panel.earth-bold {
  font-weight: 700;
}

.earth-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.earth-title {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 1px;
}

.earth-sub {
  margin-top: 2px;
  color: #94a3b8;
  font-size: 11px;
}

.earth-actions {
  display: flex;
  gap: 2px;
}

.earth-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.earth-scroll::-webkit-scrollbar {
  width: 6px;
}

.earth-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.18);
  border-radius: 3px;
}

.earth-block {
  margin-bottom: 14px;
}

.earth-label {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
  color: #94a3b8;
  font-size: 12px;
}

.earth-panel :deep(.el-input__wrapper),
.earth-panel :deep(.el-select__wrapper),
.earth-panel :deep(.el-range-editor.el-input__wrapper) {
  background-color: rgba(255, 255, 255, 0.06);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12) inset;
}

.earth-panel :deep(.el-input__inner),
.earth-panel :deep(.el-select__selected-item),
.earth-panel :deep(.el-range-input),
.earth-panel :deep(.el-range-separator) {
  color: #e5e7eb;
}

.earth-panel :deep(.el-input__inner::placeholder) {
  color: #64748b;
}

.earth-panel :deep(.el-button:not(.el-button--primary):not(.is-text)) {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.14);
  color: #e5e7eb;
}

.earth-panel :deep(.el-button.is-text) {
  color: #e5e7eb;
}

.earth-panel :deep(.el-radio-button__inner) {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.12);
  color: #cbd5e1;
}

.earth-panel :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background: #409eff;
  border-color: #409eff;
  color: #ffffff;
}

.earth-panel :deep(.el-radio-group) {
  flex-wrap: wrap;
  gap: 4px;
}

.earth-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 14px;
}

.earth-grid-2 :deep(.el-select),
.earth-block :deep(.el-date-editor),
.earth-block :deep(.el-select) {
  width: 100%;
}

.earth-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 6px 0;
}

.time-row :deep(.el-select) {
  width: 140px;
}

.earth-meta {
  color: #94a3b8;
  font-size: 11px;
}

.mono {
  font-family: 'SFMono-Regular', Consolas, monospace;
}

.earth-legend {
  height: 10px;
  border-radius: 3px;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.earth-legend-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  color: #94a3b8;
  font-size: 10px;
}

.earth-switch-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.earth-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 3px 0;
  color: #cbd5e1;
  font-size: 12px;
}
.earth-weather-row > span {
  flex: 1;
}
.earth-weather-row small {
  display: block;
  color: #77d6b7;
  font-size: 10px;
  margin-top: 3px;
}
.earth-business-note {
  line-height: 1.6;
}

.earth-probe {
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  font-size: 12px;
  line-height: 1.7;
  color: #cbd5e1;
}

.earth-settings {
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
}

.earth-error {
  color: #f56c6c;
  font-size: 12px;
}

.earth-note {
  margin: -4px 0 12px;
  padding: 7px 9px;
  border-radius: 6px;
  background: rgba(230, 162, 60, 0.1);
  color: #fbbf24;
  font-size: 11px;
  line-height: 1.5;
}

.earth-loading {
  color: #94a3b8;
  font-size: 12px;
}

.earth-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(56, 189, 248, 0.08);
  color: #7dd3fc;
  font-size: 11px;
}

.earth-sidebar-tabs {
  pointer-events: auto;
  position: absolute;
  top: 120px;
  left: 20px;
  width: 350px;
  max-width: calc(100% - 40px);
  display: flex;
  gap: 5px;
  padding: 7px;
  background: #111827f5;
  border: 1px solid #ffffff26;
  border-radius: 8px 8px 0 0;
}
.earth-sidebar-tabs button {
  border: 0;
  background: transparent;
  color: #cbd5e1;
  padding: 6px 12px;
  cursor: pointer;
}
.earth-sidebar-tabs button[aria-pressed='true'] {
  background: #3cb59424;
  color: #b7ebde;
  border-radius: 4px;
}
.earth-sidebar-tabs button:last-child {
  margin-left: auto;
}
.earth-panel,
.earth-catalog,
.earth-analysis-panel {
  top: 163px;
  left: 20px;
  bottom: 84px;
  width: 350px;
  max-width: calc(100% - 40px);
  max-height: none;
  border-radius: 0 0 8px 8px;
}
.earth-catalog {
  font-size: 12px;
}
.earth-analysis-panel {
  position: absolute;
  pointer-events: auto;
  padding: 14px;
  overflow: auto;
  background: #080e15ed;
  border: 1px solid #ffffff26;
}
.earth-data-card {
  max-height: calc((100% - 228px) / 2);
  overflow: auto;
}
.earth-readout-card {
  top: 120px;
  max-height: calc((100% - 228px) / 2);
  overflow: auto;
}
.earth-diagnostics {
  margin-top: 10px;
  overflow-wrap: anywhere;
}
.earth-save-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 12px;
}
.earth-save-actions :deep(.el-button) {
  margin: 0;
}
.earth-hover-readout {
  position: absolute;
  top: 114px;
  left: 50%;
  transform: translateX(-50%);
  color: #b7ebde;
  background: #080e15bb;
  padding: 5px 8px;
  border-radius: 4px;
  font-size: 11px;
  pointer-events: none;
  white-space: nowrap;
}
.earth-mobile-tabs,
.earth-mini-legend {
  display: none;
}
.earth-global-status {
  position: absolute;
  top: 170px;
  left: 50%;
  transform: translateX(-50%);
  max-width: 80%;
  pointer-events: auto;
  padding: 12px;
  border-radius: 8px;
  background: #111827ed;
  color: #e5e7eb;
  font-size: 12px;
}
.earth-global-status button {
  margin-left: 8px;
}
.earth-mode-chip:disabled {
  opacity: 0.5;
  cursor: wait;
}
.earth-hud-bottom {
  bottom: calc(12px + env(safe-area-inset-bottom));
}
.earth-current-readout {
  white-space: nowrap;
}
@media (min-width: 721px) and (max-width: 900px) {
  .earth-timeline-label {
    display: none;
  }
  .earth-panel,
  .earth-catalog,
  .earth-sidebar-tabs,
  .earth-analysis-panel {
    width: 320px;
  }
}
@media (max-width: 720px) {
  .earth-mini-legend {
    display: block;
    position: absolute;
    pointer-events: auto;
    bottom: calc(143px + env(safe-area-inset-bottom));
    right: 12px;
    width: 155px;
    padding: 8px;
    background: #080e15d9;
    color: #cbd5e1;
    border-radius: 6px;
    font-size: 10px;
  }
  .earth-mini-legend .earth-legend {
    height: 5px;
    margin: 5px 0;
  }
  .earth-mini-legend button {
    float: right;
    color: #cbd5e1;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .earth-hud-top {
    top: max(8px, env(safe-area-inset-top));
    left: 12px;
    right: 12px;
  }
  .earth-brand-mark {
    letter-spacing: 0.6px;
    font-size: 11px;
  }
  .earth-hud-status {
    display: none;
  }
  .earth-mode-strip {
    top: 60px;
    left: 12px;
    right: 12px;
    max-width: none;
  }
  .earth-mobile-tabs {
    position: absolute;
    bottom: calc(96px + env(safe-area-inset-bottom));
    left: 12px;
    right: 12px;
    display: flex;
    pointer-events: auto;
    background: #111827ed;
    border: 1px solid #ffffff26;
    border-radius: 6px;
  }
  .earth-mobile-tabs button {
    flex: 1;
    border: 0;
    background: transparent;
    color: #cbd5e1;
    padding: 9px 0;
    cursor: pointer;
  }
  .earth-mobile-tabs button[aria-expanded='true'] {
    color: #b7ebde;
    background: #3cb59424;
  }
  .earth-panel,
  .earth-catalog,
  .earth-analysis-panel {
    top: auto;
    left: 12px;
    right: 12px;
    bottom: calc(136px + env(safe-area-inset-bottom));
    width: auto;
    max-width: none;
    height: min(48dvh, 420px);
    max-height: none;
    z-index: 5;
  }
  .earth-sidebar-tabs {
    top: auto;
    left: 12px;
    right: 12px;
    bottom: calc(136px + env(safe-area-inset-bottom) + min(48dvh, 420px));
    width: auto;
    max-width: none;
    z-index: 5;
  }
  .earth-data-card,
  .earth-readout-card {
    display: none;
  }
  .drawer-open.drawer-data .earth-data-card,
  .drawer-open.drawer-points .earth-readout-card {
    display: block;
    top: auto;
    left: 12px;
    right: 12px;
    width: auto;
    bottom: calc(136px + env(safe-area-inset-bottom));
    max-height: 48dvh;
    z-index: 5;
    overflow: auto;
  }
  .earth-hud-bottom {
    left: 12px;
    right: 12px;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 10px;
    padding: 6px 10px;
    height: 78px;
  }
  .earth-play-control {
    grid-column: 1;
    align-items: center;
  }
  .earth-current-readout {
    grid-row: 1;
    grid-column: 2;
    min-width: 0;
    max-width: none;
    align-items: flex-end;
    font-size: 10px;
  }
  .earth-timeline {
    grid-row: 2;
    grid-column: 1 / -1;
    min-width: 0;
  }
  .earth-timeline-label {
    display: none;
  }
  .earth-menu-toggle {
    font-size: 16px;
    margin-right: 4px;
  }
  .earth-play-control :deep(.el-button) {
    width: 26px;
    height: 26px;
    margin-left: 0;
  }
  .earth-hover-readout {
    top: 104px;
    max-width: calc(100% - 24px);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .earth-catalog-heading small {
    display: none;
  }
}
@media (max-height: 450px) and (max-width: 900px) {
  .earth-panel,
  .earth-catalog,
  .earth-analysis-panel {
    top: 124px;
    bottom: 84px;
    height: auto;
  }
  .earth-sidebar-tabs {
    top: 90px;
    bottom: auto;
  }
}
</style>
