<script setup lang="ts">
import { computed, reactive, ref, shallowRef } from 'vue'
import { Refresh, Sunny } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useClock, useViewer } from '@sgyx/cesium-kit-vue'
import { createWeatherPlugin, type WeatherLayerKind, type WeatherPlugin } from '@sgyx/cesium-kit-weather'

interface WeatherManifestLayer {
  kind: WeatherLayerKind
  name: string
  file: string
  unit?: string
  defaultVisible?: boolean
  defaultAlpha?: number
  legend: {
    min: number
    max: number
    unit?: string
    colors: string[]
  }
}

interface WeatherManifest {
  name?: string
  range: { start: string; end: string }
  layers: WeatherManifestLayer[]
  pointsFile?: string
  warningsFile?: string
}

const { manager } = useViewer()
const { state } = useClock()

const enabled = ref(false)
const loading = ref(false)
const refreshing = ref(false)
const errorText = ref('')
const manifest = ref<WeatherManifest | null>(null)
const plugin = shallowRef<WeatherPlugin | null>(null)
const activeKind = ref<WeatherLayerKind>('precip')
const range = ref<[Date, Date] | null>(null)
const followClock = ref(true)
const pointsEnabled = ref(false)
const warningsEnabled = ref(false)
const visible = reactive<Record<string, boolean>>({})
const alphas = reactive<Record<string, number>>({})
const layerLoading = reactive<Record<string, boolean>>({})
const layerLoaded = reactive<Record<string, boolean>>({})
const layerErrors = reactive<Record<string, string>>({})

const presets = [
  { label: '6h', hours: 6 },
  { label: '12h', hours: 12 },
  { label: '24h', hours: 24 },
  { label: '48h', hours: 48 },
  { label: '72h', hours: 72 }
]

const currentTime = computed(() => state.value?.currentTime ?? null)

const currentFrameTime = computed(() => {
  const frame = plugin.value?.getCurrentFrame(activeKind.value)
  if (frame) return frame.time
  return currentTime.value
})

const activeLayer = computed(() =>
  manifest.value?.layers.find((layer) => layer.kind === activeKind.value)
)

const legendStyle = computed(() => {
  const colors = activeLayer.value?.legend.colors ?? []
  return { background: `linear-gradient(90deg, ${colors.join(', ')})` }
})

const legendTicks = computed(() => {
  const layer = activeLayer.value
  if (!layer) return []
  const min = layer.legend.min
  const max = layer.legend.max
  const unit = layer.legend.unit ?? layer.unit ?? ''
  return [min, (min + max) / 2, max].map((value) => `${formatNumber(value)} ${unit}`)
})

const rangeText = computed(() => {
  const value = range.value
  if (!value) return '-'
  return `${formatTime(value[0])} ~ ${formatTime(value[1])}`
})

const dataRange = computed(() => {
  const meta = manifest.value
  if (!meta) return null
  return { start: new Date(meta.range.start), end: new Date(meta.range.end) }
})

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

function disabledDate(time: Date): boolean {
  const data = dataRange.value
  if (!data) return false
  const start = new Date(data.start)
  start.setHours(0, 0, 0, 0)
  const end = new Date(data.end)
  end.setHours(23, 59, 59, 999)
  return time.getTime() < start.getTime() || time.getTime() > end.getTime()
}

async function loadManifest(): Promise<WeatherManifest> {
  if (manifest.value) return manifest.value
  const response = await fetch('/data/weather/manifest.json')
  if (!response.ok) {
    throw new Error(`天气样例加载失败 ${response.status} ${response.statusText}`)
  }
  const data = (await response.json()) as WeatherManifest
  manifest.value = data
  return data
}

function resetLayerState(meta: WeatherManifest): void {
  for (const layer of meta.layers) {
    visible[layer.kind] = layer.defaultVisible ?? false
    alphas[layer.kind] = layer.defaultAlpha ?? 0.75
    layerLoading[layer.kind] = Boolean(visible[layer.kind])
    layerLoaded[layer.kind] = false
    layerErrors[layer.kind] = ''
  }
  if (meta.layers[0]) activeKind.value = meta.layers[0].kind
}

function syncRangeFromPlugin(): void {
  const weather = plugin.value
  const instance = manager.value
  if (!weather || !instance) return
  const effective = weather.getTimeRange()
  if (!effective) return
  range.value = [new Date(effective.start), new Date(effective.end)]
  instance.clock.setRange(effective.start, effective.end)
  const current = instance.clock.state.currentTime
  if (current < effective.start || current > effective.end) {
    instance.clock.seek(effective.start)
  }
}

async function enableWeather(): Promise<void> {
  const instance = manager.value
  if (!instance || loading.value) return
  loading.value = true
  errorText.value = ''
  let pending: WeatherPlugin | null = null
  try {
    const meta = await loadManifest()
    resetLayerState(meta)
    pointsEnabled.value = false
    warningsEnabled.value = false
    followClock.value = true

    const weather = createWeatherPlugin({
      layers: meta.layers.map((layer) => ({
        kind: layer.kind,
        name: layer.name,
        data: `/data/weather/${layer.file}`,
        colors: layer.legend.colors,
        min: layer.legend.min,
        max: layer.legend.max,
        alpha: layer.defaultAlpha ?? 0.75,
        visible: layer.defaultVisible ?? false,
        followClock: true,
        syncClockRange: false,
        preload: 1
      })),
      points: meta.pointsFile
        ? {
            points: `/data/weather/${meta.pointsFile}`,
            visible: false,
            showPopup: true
          }
        : false,
      warnings: meta.warningsFile
        ? {
            warnings: `/data/weather/${meta.warningsFile}`,
            visible: false,
            showPopup: true
          }
        : false,
      followClock: true,
      syncClockRange: true,
      lazy: true,
      continueOnError: true,
      onLayerLoaded: (key) => {
        layerLoaded[key] = true
        layerLoading[key] = false
      },
      onLayerError: (key, error) => {
        layerErrors[key] = errorMessage(error)
        layerLoading[key] = false
        if (key !== 'points' && key !== 'warnings') visible[key] = false
      },
      onTimeRangeChange: (effective) => {
        if (!effective) return
        range.value = [new Date(effective.start), new Date(effective.end)]
        instance.clock.setRange(effective.start, effective.end)
        const current = instance.clock.state.currentTime
        if (current < effective.start || current > effective.end) {
          instance.clock.seek(effective.start)
        }
      }
    })

    pending = weather
    await instance.features.register(weather)
    if (Object.keys(weather.layers).length === 0) {
      throw new Error('天气图层全部加载失败，请查看面板错误信息')
    }
    plugin.value = weather
    Object.assign(
      layerErrors,
      Object.fromEntries(
        Object.entries(weather.errors).map(([key, error]) => [key, errorMessage(error)])
      )
    )
    syncRangeFromPlugin()
    enabled.value = true
  } catch (error) {
    if (pending && manager.value?.features.has(pending.name)) {
      manager.value.features.unregister(pending.name)
    }
    errorText.value = errorMessage(error)
    enabled.value = false
    plugin.value = null
    ElMessage.error(errorText.value)
  } finally {
    loading.value = false
  }
}

function disableWeather(): void {
  const instance = manager.value
  const weather = plugin.value
  if (instance && weather) instance.features.unregister(weather.name)
  plugin.value = null
  enabled.value = false
  errorText.value = ''
  pointsEnabled.value = false
  warningsEnabled.value = false
  Object.keys(layerErrors).forEach((key) => {
    layerErrors[key] = ''
  })
  Object.keys(layerLoaded).forEach((key) => {
    layerLoaded[key] = false
  })
  Object.keys(layerLoading).forEach((key) => {
    layerLoading[key] = false
  })
}

function onEnabled(value: boolean): void {
  if (value) void enableWeather()
  else disableWeather()
}

function applyRange(start: Date, end: Date): void {
  const weather = plugin.value
  const instance = manager.value
  if (!weather || !instance) return
  weather.setTimeRange(start, end)
  const effective = weather.getTimeRange()
  if (!effective) return
  range.value = [new Date(effective.start), new Date(effective.end)]
  instance.clock.setRange(effective.start, effective.end)
  const current = instance.clock.state.currentTime
  if (current < effective.start || current > effective.end) {
    instance.clock.seek(effective.start)
  }
}

function onRangeChange(value: Date[] | null): void {
  if (!value || value.length < 2) {
    const data = dataRange.value
    if (data) applyRange(data.start, data.end)
    return
  }
  const start = value[0]
  const end = value[1]
  if (!start || !end) return
  applyRange(start, end)
}

function applyPreset(hours: number): void {
  const data = dataRange.value
  if (!data) return
  const end = new Date(Math.min(data.start.getTime() + hours * 3600_000, data.end.getTime()))
  applyRange(data.start, end)
}

async function onLayerVisible(kind: WeatherLayerKind, value: boolean): Promise<void> {
  visible[kind] = value
  const weather = plugin.value
  if (!weather) return
  if (!value) {
    weather.setLayerVisible(kind, false)
    return
  }
  layerErrors[kind] = ''
  layerLoading[kind] = !layerLoaded[kind]
  try {
    await weather.setLayerVisible(kind, true)
    layerLoaded[kind] = true
  } catch (error) {
    layerErrors[kind] = errorMessage(error)
    visible[kind] = false
    ElMessage.error(layerErrors[kind])
  } finally {
    layerLoading[kind] = false
  }
}

function onLayerAlpha(kind: WeatherLayerKind, value: number): void {
  alphas[kind] = value
  plugin.value?.setLayerAlpha(kind, value)
}

function onPoints(value: boolean): void {
  pointsEnabled.value = value
  plugin.value?.setPointsVisible(value)
}

function onWarnings(value: boolean): void {
  warningsEnabled.value = value
  plugin.value?.setWarningsVisible(value)
}

function onFollowClock(value: boolean): void {
  followClock.value = value
  plugin.value?.setFollowClock(value)
}

async function refreshWeather(): Promise<void> {
  const weather = plugin.value
  if (!weather || refreshing.value) return
  refreshing.value = true
  try {
    await weather.refresh()
    syncRangeFromPlugin()
    ElMessage.success('天气数据已刷新')
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    refreshing.value = false
  }
}
</script>

<template>
  <el-card class="cesium-panel" shadow="always" :body-style="{ padding: '16px' }">
    <template #header>
      <div class="panel-title">
        <el-icon><Sunny /></el-icon>
        <span>天气预报</span>
      </div>
    </template>

    <div class="row">
      <el-switch
        :model-value="enabled"
        size="small"
        :loading="loading"
        active-text="天气图层"
        inline-prompt
        @update:model-value="onEnabled(Boolean($event))"
      />
      <el-button
        v-if="enabled"
        :icon="Refresh"
        size="small"
        circle
        :loading="refreshing"
        title="刷新天气数据"
        @click="refreshWeather()"
      />
    </div>

    <p v-if="errorText" class="error">{{ errorText }}</p>

    <template v-if="enabled">
      <div class="field">
        <div class="field-label">时间范围（本地时间）</div>
        <el-date-picker
          :model-value="range"
          type="datetimerange"
          size="small"
          range-separator="至"
          start-placeholder="开始"
          end-placeholder="结束"
          :disabled-date="disabledDate"
          @update:model-value="onRangeChange($event as Date[] | null)"
        />
        <div class="presets">
          <el-button
            v-for="preset in presets"
            :key="preset.label"
            size="small"
            plain
            @click="applyPreset(preset.hours)"
          >
            {{ preset.label }}
          </el-button>
        </div>
        <div class="meta mono">{{ rangeText }}</div>
      </div>

      <div class="field">
        <div class="field-label">当前图层</div>
        <el-select v-model="activeKind" size="small">
          <el-option
            v-for="layer in manifest?.layers ?? []"
            :key="layer.kind"
            :value="layer.kind"
            :label="layer.name"
          />
        </el-select>
        <div class="legend" :style="legendStyle" />
        <div class="legend-labels meta mono">
          <span v-for="tick in legendTicks" :key="tick">{{ tick }}</span>
        </div>
      </div>

      <div class="layers">
        <div v-for="layer in manifest?.layers ?? []" :key="layer.kind" class="layer-row">
          <div class="layer-head">
            <el-switch
              :model-value="visible[layer.kind] ?? false"
              size="small"
              :loading="layerLoading[layer.kind] ?? false"
              :active-text="layer.name"
              inline-prompt
              @update:model-value="onLayerVisible(layer.kind, Boolean($event))"
            />
            <span class="meta mono">{{ layer.unit ?? '' }}</span>
          </div>
          <el-slider
            :model-value="alphas[layer.kind] ?? 0.75"
            :min="0.1"
            :max="1"
            :step="0.05"
            size="small"
            @update:model-value="onLayerAlpha(layer.kind, Number($event))"
          />
          <p v-if="layerErrors[layer.kind]" class="layer-error">
            {{ layerErrors[layer.kind] }}
          </p>
        </div>
      </div>

      <div class="extra-switches">
        <el-switch
          :model-value="pointsEnabled"
          size="small"
          active-text="城市预报"
          inline-prompt
          @update:model-value="onPoints(Boolean($event))"
        />
        <el-switch
          :model-value="warningsEnabled"
          size="small"
          active-text="气象预警"
          inline-prompt
          @update:model-value="onWarnings(Boolean($event))"
        />
        <el-switch
          :model-value="followClock"
          size="small"
          active-text="跟随时间轴"
          inline-prompt
          @update:model-value="onFollowClock(Boolean($event))"
        />
      </div>

      <div class="field">
        <div class="field-label">当前帧（本地时间）</div>
        <div class="frame mono">{{ formatTime(currentFrameTime) }}</div>
      </div>
    </template>

    <p class="hint">
      静态样例包含降水、雷达、温度、云量和湿度；隐藏图层按需加载，城市与预警可在地图上点击查看。
    </p>
  </el-card>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.meta {
  color: #9ca3af;
}

.error {
  margin: 0 0 10px;
  color: #f56c6c;
  font-size: 12px;
  line-height: 1.5;
}

.field :deep(.el-date-editor),
.field :deep(.el-select) {
  width: 100%;
}

.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.presets :deep(.el-button) {
  margin-left: 0;
  padding: 4px 8px;
}

.legend {
  height: 10px;
  margin-top: 10px;
  border-radius: 3px;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.legend-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 11px;
}

.layers {
  margin-bottom: 12px;
}

.layer-row {
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.layer-row:last-child {
  border-bottom: none;
}

.layer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 2px;
}

.layer-error {
  margin: 0;
  color: #f56c6c;
  font-size: 11px;
  line-height: 1.4;
}

.extra-switches {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}

.frame {
  padding: 7px 10px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
  color: #67c23a;
}

.hint {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #9ca3af;
}
</style>
