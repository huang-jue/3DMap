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

const { manager } = useViewer()
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
let pendingPlugin: EarthPlugin | null = null
let cancelled = false
const annotationVisible = reactive<Record<string, boolean>>({})
const weatherVisible = reactive({
  points: false,
  warnings: false,
  windFarm: false
})
const settings = reactive<EarthSettings>({ ...DEFAULT_EARTH_SETTINGS })
const controlsOpen = ref(true)
const timelineValue = ref(0)

const currentTime = computed(() => state.value?.currentTime ?? new Date())
const timeProgress = computed(() => {
  const range = manifest.value?.range
  if (!range) return timelineValue.value
  const total = range.end.getTime() - range.start.getTime()
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, ((currentTime.value.getTime() - range.start.getTime()) / total) * 100))
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
const legendStyle = computed(() => ({
  background: `linear-gradient(90deg, ${(legend.value?.colors ?? []).join(', ')})`
}))
const legendTicks = computed(() => {
  const item = legend.value
  if (!item) return []
  return [item.min, (item.min + item.max) / 2, item.max].map(
    (value) => `${formatNumber(value)} ${item.unit}`
  )
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
  if (plugin.vector) vectorId.value = plugin.vector.id
  if (plugin.overlay) overlayId.value = plugin.overlay.id
}

async function enable(): Promise<void> {
  const instance = manager.value
  if (!instance) return
  loading.value = true
  errorText.value = ''
  pendingPlugin = null
  cancelled = false
  let pending: EarthPlugin | null = null
  try {
    const response = await fetch('/data/earth/manifest.json')
    if (!response.ok) {
      throw new Error(`地球样例加载失败 ${response.status} ${response.statusText}`)
    }
    const parsed = parseEarthManifest(await response.json())
    manifest.value = parsed
    modeId.value = 'atmosphere'
    syncAnnotationsFromMode()
    timeValue.value = new Date(parsed.range.start)
    const plugin = createEarthPlugin({
      data: parsed,
      mode: 'atmosphere',
      vector: 'wind',
      overlay: 'temperature',
      followClock: true,
      syncClockRange: true,
      settings,
      weather: true,
      onProbe: (result) => {
        probe.value = result
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
        lon: (parsed.bounds.west + parsed.bounds.east) / 2,
        lat: (parsed.bounds.south + parsed.bounds.north) / 2,
        height: 20_000_000
      })
    }
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
  if (!plugin) return
  modeId.value = value
  syncAnnotationsFromMode()
  await plugin.setMode(value)
  syncSelectionsFromPlugin()
}

async function onOverlayChange(value: string): Promise<void> {
  overlayId.value = value
  await earth.value?.setOverlay(value)
}

async function onVectorChange(value: string): Promise<void> {
  vectorId.value = value
  await earth.value?.setVector(value)
}

function onAnnotation(id: string, value: boolean): void {
  annotationVisible[id] = value
  earth.value?.setAnnotation(id, value)
}

function onWeather(key: keyof typeof weatherVisible, value: boolean): void {
  weatherVisible[key] = value
  if (key === 'points') earth.value?.setWeatherPointsVisible(value)
  else if (key === 'warnings') earth.value?.setWeatherWarningsVisible(value)
  else earth.value?.setWindFarmVisible(value)
}

function onProjection(value: EarthProjection): void {
  projection.value = value
  earth.value?.setProjection(value)
}

function onTimeChange(value: Date | null): void {
  if (!value) return
  timeValue.value = value
  earth.value?.setTime(value)
  manager.value?.clock.seek(value)
}

function onTimelineInput(value: string): void {
  const range = manifest.value?.range
  if (!range) return
  const next = Number(value)
  timelineValue.value = next
  const time = new Date(range.start.getTime() + (range.end.getTime() - range.start.getTime()) * next / 100)
  onTimeChange(time)
}

function onFollowClock(value: boolean): void {
  followClock.value = value
  earth.value?.setFollowClock(value)
}

function onPlay(): void {
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
    height: 20_000_000
  })
}

const speedOptions = [
  { value: 3600, label: '1 小时/秒' },
  { value: 21600, label: '6 小时/秒' },
  { value: 86400, label: '1 天/秒' }
]

onMounted(() => {
  void enable()
})

watch(timeProgress, (value) => {
  timelineValue.value = value
})

onBeforeUnmount(() => {
  cancelled = true
  const instance = manager.value
  const plugin = earth.value ?? pendingPlugin
  if (instance && plugin && instance.features.has(plugin.name)) {
    instance.features.unregister(plugin.name)
  }
  earth.value = null
  pendingPlugin = null
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
        <el-button :icon="InfoFilled" circle text title="显示当前数据" @click="settings.infoBar = !settings.infoBar" />
        <el-button :icon="controlsOpen ? Expand : Menu" circle text title="切换控制面板" @click="controlsOpen = !controlsOpen" />
      </div>
    </div>

    <div v-if="manifest" class="earth-mode-strip">
      <button
        v-for="mode in manifest.modes"
        :key="mode.id"
        class="earth-mode-chip"
        :class="{ active: mode.id === modeId }"
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
          <div class="earth-label">模式</div>
          <el-radio-group
            :model-value="modeId"
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
              :disabled="vectors.length === 0 || projection !== '3D'"
              @update:model-value="onVectorChange(String($event))"
            >
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
              :disabled="overlays.length === 0"
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

        <div v-if="projection !== '3D'" class="earth-note">
          平面/哥伦布模式暂不启用 GPU 粒子矢量场，切换回球面后自动恢复。
        </div>

        <div class="earth-block">
          <div class="earth-label">投影</div>
          <el-radio-group
            :model-value="projection"
            size="small"
            @update:model-value="onProjection($event as EarthProjection)"
          >
            <el-radio-button value="3D">球面</el-radio-button>
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
            <div class="earth-switch-row">
              <span>城市预报</span>
              <el-switch
                :model-value="weatherVisible.points"
                size="small"
                @update:model-value="onWeather('points', Boolean($event))"
              />
            </div>
            <div class="earth-switch-row">
              <span>气象预警</span>
              <el-switch
                :model-value="weatherVisible.warnings"
                size="small"
                @update:model-value="onWeather('warnings', Boolean($event))"
              />
            </div>
            <div class="earth-switch-row">
              <span>风电场</span>
              <el-switch
                :model-value="weatherVisible.windFarm"
                size="small"
                @update:model-value="onWeather('windFarm', Boolean($event))"
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
          <span class="mono">{{ manifest?.source }}</span>
          <span class="mono">{{ formatTime(currentTime) }}</span>
        </div>
      </div>
    </section>

    <div class="earth-hud earth-hud-bottom">
      <div class="earth-play-control">
        <el-button :icon="VideoPlay" circle text title="播放时间" @click="onPlay" />
        <el-button :icon="VideoPause" circle text title="暂停时间" @click="onPause" />
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
  pointer-events: none;
  position: absolute;
  top: 72px;
  left: 20px;
  bottom: 84px;
  width: 384px;
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

.earth-panel > * {
  pointer-events: auto;
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
  max-width: min(620px, calc(100vw - 420px));
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
}
</style>
