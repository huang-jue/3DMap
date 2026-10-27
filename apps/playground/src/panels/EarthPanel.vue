<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
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
import {
  createEarthPlugin,
  parseEarthManifest,
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
const controlsOpen = ref(false)
const timelineValue = ref(0)

const currentTime = computed(() => state.value?.currentTime ?? new Date())
const readout = computed(() => probe.value ?? hoveredProbe.value)
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
const frameTimes = computed(() => manifest.value?.metadata?.times ?? [])
const timeProgress = computed(() => {
  const range = manifest.value?.range
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
const vectors = computed<EarthVectorConfig[]>(() => activeMode.value?.vectors ?? [])
const overlays = computed<EarthOverlayConfig[]>(() => activeMode.value?.overlays ?? [])
const activeOverlay = computed<EarthOverlayConfig | null>(
  () => overlays.value.find((item) => item.id === overlayId.value) ?? null
)
const legend = computed(() => activeOverlay.value)
const fieldMetadata = computed(() => activeOverlay.value?.metadata ?? manifest.value?.metadata)
const fieldSource = computed(() => activeOverlay.value?.metadata?.source ?? manifest.value?.source)
const isPm25 = computed(() => dataset.value === 'real' && overlayId.value === 'pm25')
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

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatTime(value: Date | null | undefined): string {
  if (!value) return '-'
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}`
}

function formatNumber(value: number): string {
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
  loading.value = true
  errorText.value = ''
  pendingPlugin = null
  cancelled = false
  let pending: EarthPlugin | null = null
  try {
    const response = await fetch(
      dataset.value === 'real' ? '/data/earth/real/manifest.json' : '/data/earth/manifest.json'
    )
    if (!response.ok) {
      throw new Error(`地球样例加载失败 ${response.status} ${response.statusText}`)
    }
    const parsed = parseEarthManifest(await response.json())
    manifest.value = parsed
    const startPm25 =
      dataset.value === 'real' &&
      (new URLSearchParams(window.location.search).get('earth') === 'pm25' ||
        window.location.hash.includes('particulates'))
    modeId.value = startPm25 ? 'particulate' : 'atmosphere'
    syncAnnotationsFromMode()
    timeValue.value = new Date(parsed.range.start)
    const plugin = createEarthPlugin({
      data: parsed,
      mode: modeId.value,
      vector: 'wind',
      overlay: startPm25 ? 'pm25' : dataset.value === 'real' ? 'wind-speed' : 'temperature',
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
        ElMessage.warning(`${key} 加载失败：${errorMessage(error)}`)
      }
    })
    pending = plugin
    pendingPlugin = plugin
    await instance.features.register(plugin)
    if (cancelled) {
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
    if (startPm25) onProjection('ORTHOGRAPHIC')
    instance.clock.loop(true)
    instance.clock.setMultiplier(speed.value)
    loading.value = false
  } catch (error) {
    if (pending && manager.value?.features.has(pending.name)) {
      manager.value.features.unregister(pending.name)
    }
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
  const plugin = earth.value
  if (!plugin || busy.value) return
  busy.value = true
  modeId.value = value
  overlayId.value = activeMode.value?.defaultOverlay ?? activeMode.value?.overlays[0]?.id ?? ''
  vectorId.value = activeMode.value?.defaultVector ?? activeMode.value?.vectors[0]?.id ?? ''
  syncAnnotationsFromMode()
  try {
    await plugin.setMode(value)
    modeId.value = plugin.mode?.id ?? value
    syncAnnotationsFromMode()
    syncSelectionsFromPlugin()
    if (dataset.value === 'real' && value === 'particulate') onProjection('ORTHOGRAPHIC')
    if (probe.value) probe.value = plugin.probe(probe.value.lon, probe.value.lat)
    if (hoveredProbe.value)
      hoveredProbe.value = plugin.probe(hoveredProbe.value.lon, hoveredProbe.value.lat)
  } catch (error) {
    ElMessage.error(`模式切换失败：${errorMessage(error)}`)
  } finally {
    busy.value = false
  }
}

async function onOverlayChange(value: string): Promise<void> {
  if (busy.value || loading.value) return
  overlayId.value = value
  await earth.value?.setOverlay(value)
}

async function onVectorChange(value: string): Promise<void> {
  if (busy.value || loading.value) return
  vectorId.value = value
  await earth.value?.setVector(value || null)
}

function onAnnotation(id: string, value: boolean): void {
  annotationVisible[id] = value
  earth.value?.setAnnotation(id, value)
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
}

function onTimeChange(value: Date | null): void {
  if (!value) return
  const range = manifest.value?.range
  const bounded = range
    ? new Date(Math.min(range.end.getTime(), Math.max(range.start.getTime(), value.getTime())))
    : value
  timeValue.value = bounded
  earth.value?.setTime(bounded)
}

function onTimelineInput(value: string): void {
  const range = manifest.value?.range
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

onMounted(async () => {
  try {
    await whenReady()
    if (!cancelled) await enable()
  } catch (error) {
    if (!cancelled) {
      loading.value = false
      errorText.value = errorMessage(error)
    }
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
  <div class="earth-panel-wrap">
    <div class="earth-hud earth-hud-top">
      <div class="earth-brand-mark">
        <span class="earth-brand-dot" />
        <span>EARTH / {{ activeMode?.label ?? 'GLOBAL' }}</span>
      </div>
      <div class="earth-hud-status mono">
        {{ formatTime(currentTime) }} · {{ activeOverlay?.label ?? '数据加载中' }}
      </div>
      <div class="earth-hud-actions">
        <el-button
          :icon="InfoFilled"
          circle
          text
          title="显示当前数据"
          @click="settings.infoBar = !settings.infoBar"
        />
        <el-button
          :icon="controlsOpen ? Expand : Menu"
          circle
          text
          title="切换控制面板"
          @click="controlsOpen = !controlsOpen"
        />
        <el-button :icon="Close" circle text title="退出地球模式" @click="close" />
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

    <section v-show="controlsOpen" class="earth-panel" :class="panelClass">
      <header class="earth-head">
        <div>
          <div class="earth-title">地球可视化</div>
          <div class="earth-sub mono">{{ manifest?.name ?? 'Global Earth' }}</div>
        </div>
        <div class="earth-actions">
          <el-button :icon="Location" size="small" text title="重置视角" @click="resetView" />
          <el-button :icon="Close" size="small" text title="退出地球模式" @click="close" />
        </div>
      </header>

      <p v-if="errorText" class="earth-error">{{ errorText }}</p>
      <div v-if="loading" class="earth-loading">正在加载地球数据…</div>

      <div v-else class="earth-scroll">
        <div class="earth-block">
          <div class="earth-label">数据集</div>
          <el-select
            v-model="dataset"
            :disabled="loading || busy"
            aria-label="数据集"
            @change="switchDataset"
          >
            <el-option value="real" label="真实 GFS + CAMS · 离线快照" />
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
              <el-button :icon="VideoPlay" @click="onPlay">播放</el-button>
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
            <span v-for="tick in legendTicks" :key="tick">{{ tick }}</span>
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

    <aside v-if="!loading && settings.infoBar" class="earth-data-card">
      <div class="earth-data-kicker">
        {{
          dataset === 'real'
            ? isPm25
              ? 'CAMS / 真实颗粒物预报'
              : 'GFS / 真实预报快照'
            : 'SYNTHETIC / 合成样例'
        }}
      </div>
      <strong
      >{{ activeOverlay?.label }} <span>{{ activeOverlay?.unit }}</span></strong
      >
      <div class="earth-legend" :style="legendStyle" />
      <div class="earth-legend-labels mono">
        <span v-for="tick in legendTicks" :key="tick">{{ tick }}</span>
      </div>
      <p v-if="fieldMetadata">
        {{ fieldMetadata.resolution }}° 全球网格 · {{ fieldMetadata.level }}
      </p>
      <p>{{ fieldSource }}</p>
      <p v-if="isPm25">对数色阶 · 蓝色低浓度 → 黄红色高浓度</p>
      <p v-if="dataset === 'real'">色层有效时间 {{ formatTime(sampledTime) }} · 离线预报</p>
      <p v-if="isPm25 && vectorId">流线：GFS 10 m 风 · 共享预报时刻</p>
      <p>拖动旋转 · 滚轮缩放 · 点击固定点查</p>
    </aside>

    <aside v-if="readout" class="earth-readout-card">
      <div class="earth-data-kicker">
        {{ probe ? '固定点查' : '鼠标采样' }}
        <button v-if="probe" type="button" aria-label="取消固定点查" @click="clearProbe">×</button>
      </div>
      <div class="mono">
        {{ Math.abs(readout.lat).toFixed(2) }}°{{ readout.lat >= 0 ? 'N' : 'S' }} ·
        {{ Math.abs(readout.lon).toFixed(2) }}°{{ readout.lon >= 0 ? 'E' : 'W' }}
      </div>
      <div v-if="readout.vector" class="earth-wind-value">
        <span
          class="earth-direction"
          :style="{ transform: `rotate(${readout.vector.direction}deg)` }"
        >↑</span
        >
        {{ readout.vector.speed.toFixed(1) }} <small>{{ readout.vector.unit }}</small>
      </div>
      <div v-if="readout.vector" class="earth-meta">
        去向 {{ Math.round(readout.vector.direction) }}° · 来向
        {{ Math.round((readout.vector.direction + 180) % 360) }}°
      </div>
      <div v-if="readout.overlay" class="earth-meta">
        {{ activeOverlay?.label }} {{ formatNumber(readout.overlay.value) }}
        {{ readout.overlay.unit }}
      </div>
    </aside>

    <div class="earth-hud earth-hud-bottom">
      <div class="earth-play-control">
        <button
          type="button"
          class="earth-menu-toggle"
          :aria-expanded="controlsOpen"
          @click="controlsOpen = !controlsOpen"
        >
          earth <span>{{ controlsOpen ? '−' : '+' }}</span>
        </button>
        <button
          type="button"
          class="earth-step"
          aria-label="上一预报时刻"
          :disabled="!frameTimes.length"
          @click="stepFrame(-1)"
        >
          ‹
        </button>
        <el-button :icon="VideoPlay" circle text title="播放时间" @click="onPlay" />
        <el-button :icon="VideoPause" circle text title="暂停时间" @click="onPause" />
        <button
          type="button"
          class="earth-step"
          aria-label="下一预报时刻"
          :disabled="!frameTimes.length"
          @click="stepFrame(1)"
        >
          ›
        </button>
      </div>
      <div class="earth-timeline">
        <div class="earth-timeline-label mono">{{ formatTime(manifest?.range.start) }}</div>
        <input
          class="earth-range"
          type="range"
          min="0"
          max="100"
          step="0.1"
          :value="timelineValue"
          aria-label="时间轴"
          @input="onTimelineInput(($event.target as HTMLInputElement).value)"
        />
        <div class="earth-timeline-label mono">{{ formatTime(manifest?.range.end) }}</div>
      </div>
      <div class="earth-current-readout mono">
        <span>{{ formatTime(currentTime) }}</span>
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

@media (max-width: 720px) {
  .earth-panel-wrap {
    inset: 0;
  }

  .earth-panel {
    top: 118px;
    left: 12px;
    bottom: 78px;
    width: min(440px, calc(100vw - 24px));
  }

  .earth-hud-top,
  .earth-hud-bottom {
    left: 12px;
    right: 12px;
  }

  .earth-hud-status {
    display: none;
  }

  .earth-mode-strip {
    top: 70px;
    left: 12px;
    right: 12px;
    max-width: none;
  }
  .earth-data-card {
    width: 200px;
    right: 12px;
    bottom: 82px;
    padding: 12px;
  }
  .earth-readout-card {
    top: 120px;
    right: 12px;
    width: 200px;
    padding: 12px;
  }
  .earth-timeline-label {
    display: none;
  }
  .earth-current-readout {
    min-width: 105px;
  }
  .earth-hud-bottom {
    gap: 6px;
    padding: 5px 8px;
  }
  .earth-play-control {
    align-items: center;
  }
  .earth-menu-toggle {
    font-size: 18px;
    margin-right: 4px;
  }
  .earth-play-control :deep(.el-button) {
    width: 26px;
    height: 26px;
    margin-left: 0;
  }
}
</style>
