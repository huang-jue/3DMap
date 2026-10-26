<script setup lang="ts">
import { computed, reactive, ref, shallowRef } from 'vue'
import { Sunny } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useClock, useViewer } from '@cesium-kit/vue'
import {
  createWeatherPlugin,
  type WeatherLayerKind,
  type WeatherPlugin
} from '@cesium-kit/weather'

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
}

const { manager } = useViewer()
const { state } = useClock()

const enabled = ref(false)
const loading = ref(false)
const errorText = ref('')
const manifest = ref<WeatherManifest | null>(null)
const plugin = shallowRef<WeatherPlugin | null>(null)
const activeKind = ref<WeatherLayerKind>('precip')
const range = ref<[Date, Date] | null>(null)
const visible = reactive<Record<string, boolean>>({})
const alphas = reactive<Record<string, number>>({})

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

const rangeText = computed(() => {
  const value = range.value
  if (!value) return '-'
  return `${formatTime(value[0])} ~ ${formatTime(value[1])}`
})

function formatTime(value: Date | null | undefined): string {
  if (!value) return '-'
  return value.toISOString().slice(0, 16).replace('T', ' ')
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
  }
  if (meta.layers[0]) activeKind.value = meta.layers[0].kind
}

async function enableWeather(): Promise<void> {
  const instance = manager.value
  if (!instance || loading.value) return
  loading.value = true
  errorText.value = ''
  try {
    const meta = await loadManifest()
    resetLayerState(meta)
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
        syncClockRange: false
      })),
      followClock: true,
      syncClockRange: true
    })

    await instance.features.register(weather)
    plugin.value = weather
    const available = weather.getAvailableRange() ?? {
      start: new Date(meta.range.start),
      end: new Date(meta.range.end)
    }
    range.value = [available.start, available.end]
    instance.clock.setRange(available.start, available.end)
    instance.clock.seek(available.start)
    enabled.value = true
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : String(error)
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
  instance.clock.setRange(start, end)
  const current = instance.clock.state.currentTime
  if (current < start || current > end) instance.clock.seek(start)
  range.value = [start, end]
}

function onRangeChange(value: Date[] | null): void {
  if (!value || value.length < 2) return
  const start = value[0]
  const end = value[1]
  if (!start || !end) return
  applyRange(start, end)
}

function applyPreset(hours: number): void {
  const meta = manifest.value
  if (!meta) return
  const dataStart = new Date(meta.range.start)
  const dataEnd = new Date(meta.range.end)
  const end = new Date(Math.min(dataStart.getTime() + hours * 3600_000, dataEnd.getTime()))
  applyRange(dataStart, end)
}

function onLayerVisible(kind: WeatherLayerKind, value: boolean): void {
  visible[kind] = value
  plugin.value?.setLayerVisible(kind, value)
}

function onLayerAlpha(kind: WeatherLayerKind, value: number): void {
  alphas[kind] = value
  plugin.value?.setLayerAlpha(kind, value)
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
      <span class="meta mono">{{ manifest?.name ?? '静态样例' }}</span>
    </div>

    <p v-if="errorText" class="error">{{ errorText }}</p>

    <template v-if="enabled">
      <div class="field">
        <div class="field-label">时间范围</div>
        <el-date-picker
          :model-value="range"
          type="datetimerange"
          size="small"
          range-separator="至"
          start-placeholder="开始"
          end-placeholder="结束"
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
          <span>{{ activeLayer?.legend.min }} {{ activeLayer?.legend.unit }}</span>
          <span>{{ activeLayer?.legend.max }} {{ activeLayer?.legend.unit }}</span>
        </div>
      </div>

      <div class="layers">
        <div v-for="layer in manifest?.layers ?? []" :key="layer.kind" class="layer-row">
          <div class="layer-head">
            <el-switch
              :model-value="visible[layer.kind] ?? false"
              size="small"
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
        </div>
      </div>

      <div class="field">
        <div class="field-label">当前帧</div>
        <div class="frame mono">{{ formatTime(currentFrameTime) }}</div>
      </div>
    </template>

    <p class="hint">
      静态样例包含降水、雷达、温度、云量和湿度；切换时间范围后，图层会跟随时间轴播放。
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
