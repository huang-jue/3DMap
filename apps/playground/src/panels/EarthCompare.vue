<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef } from 'vue'
import type { CesiumViewerManager } from '@sgyx/cesium-kit-core'
import {
  EarthCompareController,
  loadEarthManifest,
  type EarthCompareState,
  type EarthManifest,
  type EarthPluginState
} from '@sgyx/cesium-kit-earth'
import { formatEarthTime } from './earthUtils'
const props = defineProps<{ manager: CesiumViewerManager; primaryState: () => EarthPluginState }>()
const host = ref<HTMLElement | null>(null)
const enabled = ref(false)
const busy = ref(false)
const error = ref('')
const config = ref<EarthCompareState | null>(null)
const manifest = shallowRef<EarthManifest | null>(null)
const actualTime = ref('')
const actualSample = ref('')
let controller: EarthCompareController | null = null
let revision = 0
const mode = computed(() =>
  manifest.value?.modes.find((item) => item.id === config.value?.secondary.mode)
)
const level = computed(
  () => mode.value?.levels?.find((item) => item.id === config.value?.secondary.level) ?? mode.value
)
const overlay = computed(() =>
  level.value?.overlays.find((item) => item.id === config.value?.secondary.overlay)
)
const times = computed(
  () => overlay.value?.metadata?.times ?? manifest.value?.metadata?.times ?? []
)
const rangeStart = computed(() => times.value[0])
const rangeEnd = computed(() => times.value.at(-1))
async function start(saved?: EarthCompareState) {
  stop()
  const current = ++revision
  busy.value = true
  error.value = ''
  try {
    const secondary = saved?.secondary ?? props.primaryState()
    config.value = saved ?? {
      mode: 'split',
      position: 50,
      cameraLinked: true,
      timeLinked: true,
      secondary: {
        ...secondary,
        annotations: [],
        weather: { points: false, warnings: false, windFarm: false }
      },
      time: props.manager.clock.state.currentTime.toISOString()
    }
    enabled.value = true
    await nextTick()
    if (current !== revision || !host.value) return
    const next = new EarthCompareController(props.manager, host.value, config.value)
    controller = next
    await next.initialize()
    if (current !== revision) return
    manifest.value = next.plugin?.manifest ?? null
    if (next.secondary) actualTime.value = formatEarthTime(next.secondary.clock.state.currentTime)
  } catch (cause) {
    if (current === revision) error.value = String(cause)
  } finally {
    if (current === revision) busy.value = false
  }
}
function stop() {
  revision++
  controller?.destroy()
  controller = null
  enabled.value = false
  busy.value = false
}
function update() {
  if (config.value) controller?.update(config.value)
}
function selectLayer(kind: 'overlay' | 'vector', value: unknown) {
  if (!config.value) return
  config.value.secondary[kind] = typeof value === 'string' && value ? value : null
  void apply()
}
async function apply(kind: 'dataset' | 'mode' | 'level' | 'variable' = 'variable') {
  if (!config.value || !controller || busy.value) return
  const current = revision
  busy.value = true
  error.value = ''
  try {
    const state = config.value.secondary
    if (kind === 'dataset') {
      const data = await loadEarthManifest(state.dataRef)
      if (current !== revision) return
      manifest.value = data
      state.mode = data.modes[0]!.id
    }
    const selectedMode = manifest.value?.modes.find((item) => item.id === state.mode)
    if (!selectedMode) throw new Error('数据模式不可用')
    if (kind === 'dataset' || kind === 'mode')
      state.level = selectedMode.defaultLevel ?? selectedMode.id
    const selectedLevel =
      selectedMode.levels?.find((item) => item.id === state.level) ?? selectedMode
    if (kind !== 'variable') {
      state.overlay = selectedLevel.defaultOverlay ?? selectedLevel.overlays[0]?.id ?? null
      state.vector = selectedLevel.defaultVector ?? selectedLevel.vectors[0]?.id ?? null
    }
    await controller.setSecondary(state)
  } catch (cause) {
    if (current === revision) error.value = String(cause)
  } finally {
    if (current === revision) busy.value = false
  }
}
function getState() {
  return enabled.value ? (controller?.getState() ?? config.value) : null
}
async function restore(state: EarthCompareState | null) {
  if (state) await start(state)
  else stop()
}
const timer = setInterval(() => {
  if (controller?.secondary)
    actualTime.value = formatEarthTime(controller.secondary.clock.state.currentTime)
  actualSample.value = formatEarthTime(controller?.plugin?.sampledTime)
}, 500)
onBeforeUnmount(() => {
  clearInterval(timer)
  stop()
})
defineExpose({ getState, restore, stop })
</script>
<template>
  <section class="compare-controls" aria-label="地图对比">
    <el-button v-if="!enabled" :loading="busy" size="small" @click="start()"
    >
      开启地图对比
    </el-button
    >
    <template v-else-if="config">
      <div class="compare-row">
        <el-select v-model="config.mode" aria-label="对比方式" :disabled="busy" @change="update">
          <el-option value="split" label="同步双屏" /><el-option value="curtain" label="卷帘对比" />
        </el-select>
        <el-button size="small" @click="stop">退出对比</el-button>
      </div>
      <label
      ><input
        v-model="config.cameraLinked"
        type="checkbox"
        :disabled="config.mode === 'curtain'"
        @change="update"
      />
        同步视角（卷帘始终同步）</label
      >
      <label><input v-model="config.timeLinked" type="checkbox" @change="update" /> 同步时间</label>
      <p>左侧 A 使用主面板，右侧 B 独立配置。</p>
      <el-select
        v-model="config.secondary.dataRef"
        aria-label="B 数据集"
        :disabled="busy"
        @change="apply('dataset')"
      >
        <el-option value="/data/earth/real/manifest.json" label="真实离线预报" /><el-option
          value="/data/earth/manifest.json"
          label="合成样例"
        />
      </el-select>
      <el-select
        v-model="config.secondary.mode"
        aria-label="B 模式"
        :disabled="busy"
        @change="apply('mode')"
      >
        <el-option
          v-for="item in manifest?.modes ?? []"
          :key="item.id"
          :value="item.id"
          :label="item.label"
        />
      </el-select>
      <el-select
        v-if="mode?.levels?.length"
        v-model="config.secondary.level"
        aria-label="B 高度层"
        :disabled="busy"
        @change="apply('level')"
      >
        <el-option v-for="item in mode.levels" :key="item.id" :value="item.id" :label="item.label"
        />
      </el-select>
      <el-select
        :model-value="config.secondary.overlay ?? ''"
        aria-label="B 标量"
        :disabled="busy"
        @change="selectLayer('overlay', $event)"
      >
        <el-option value="" label="无标量" /><el-option
          v-for="item in level?.overlays ?? []"
          :key="item.id"
          :value="item.id"
          :label="item.label"
        />
      </el-select>
      <el-select
        :model-value="config.secondary.vector ?? ''"
        aria-label="B 矢量"
        :disabled="busy"
        @change="selectLayer('vector', $event)"
      >
        <el-option value="" label="无矢量" /><el-option
          v-for="item in level?.vectors ?? []"
          :key="item.id"
          :value="item.id"
          :label="item.label"
        />
      </el-select>
      <el-select
        v-model="config.time"
        aria-label="B 时刻"
        :disabled="busy || config.timeLinked"
        @change="controller?.setTime(config.time)"
      >
        <el-option
          v-for="time in times"
          :key="time"
          :value="time"
          :label="formatEarthTime(new Date(time))"
        />
      </el-select>
      <p v-if="busy" role="status">B 正在加载…</p>
      <p v-if="error" role="alert">
        {{ error }} <el-button size="small" @click="apply()">重试 B</el-button>
      </p>
    </template>
  </section>
  <Teleport :to="manager.viewer.container">
    <div v-if="enabled" ref="host" class="comparison-viewer" aria-label="B 对比地图" />
    <div v-if="enabled && config" class="compare-label compare-label-a">A · 主地图</div>
    <aside v-if="enabled && config" class="compare-label compare-label-b">
      B · {{ overlay?.label ?? '仅矢量' }} · {{ actualTime }} UTC+8
      <template v-if="overlay"
      >
        <div
          class="compare-legend"
          :style="{ background: `linear-gradient(90deg, ${overlay.colors.join(',')})` }"
        />
        <span>{{ overlay.min }} — {{ overlay.max }} {{ overlay.unit }}</span>
      </template
      >
      <small
      >实际色层 {{ actualSample }}<br />有效范围
        {{ rangeStart ? formatEarthTime(new Date(rangeStart)) : '-' }} —
        {{ rangeEnd ? formatEarthTime(new Date(rangeEnd)) : '-' }}</small
      >
    </aside>
    <input
      v-if="enabled && config?.mode === 'curtain'"
      v-model.number="config.position"
      class="compare-divider"
      type="range"
      min="5"
      max="95"
      step="1"
      aria-label="卷帘分割位置"
      @input="update"
    />
    <div
      v-if="enabled && config?.mode === 'curtain'"
      class="compare-line"
      :style="{ left: `${config.position}%` }"
    />
  </Teleport>
</template>
<style>
.comparison-viewer {
  z-index: 3;
  background: #080e15;
}
.compare-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 0;
  font-size: 12px;
}
.compare-row {
  display: flex;
  gap: 8px;
}
.compare-label {
  position: absolute;
  z-index: 7;
  pointer-events: none;
  top: 122px;
  padding: 7px;
  background: #080e15db;
  color: #dce5ee;
  border-radius: 5px;
  font-size: 11px;
  max-width: 230px;
}
.compare-label-a {
  left: 12px;
}
.compare-label-b {
  right: 12px;
}
.compare-label small {
  display: block;
  font-size: 9px;
}
.compare-legend {
  height: 6px;
  margin: 6px 0;
}
.compare-divider {
  position: absolute;
  inset: 50% 0 auto;
  width: 100%;
  z-index: 9;
  height: 32px;
  margin: 0;
  opacity: 0.8;
  accent-color: #77d6b7;
}
.compare-line {
  position: absolute;
  top: 0;
  bottom: 0;
  border-left: 2px solid #77d6b7;
  z-index: 5;
  pointer-events: none;
}
@media (max-width: 720px) {
  .compare-label {
    top: 114px;
    max-width: 170px;
  }
  .compare-label small {
    display: none;
  }
}
</style>
