<script setup lang="ts">
import { defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as Cesium from 'cesium'
import { useViewer } from '@sgyx/cesium-kit-vue'
const RainForecastPanel = defineAsyncComponent(() => import('./RainForecastPanel.vue'))
const props = defineProps<{ earthMode: boolean }>()
const emit = defineEmits<{ analysis: []; opened: []; closed: [] }>()
const { manager } = useViewer()
const visible = ref(false)
const point = ref<{ lon: number; lat: number } | null>(null)
const mode = ref<'online' | 'demo'>('online')
const selecting = ref(false)
const fresh = ref(false)
const shell = ref<HTMLElement | null>(null)
let previousFocus: HTMLElement | null = null
let marker: Cesium.Entity | undefined
let offExtension: (() => void) | undefined
let offPick: (() => void) | undefined

function rememberFocus() {
  previousFocus = document.activeElement as HTMLElement | null
}
async function open(position: { lon: number; lat: number }) {
  rememberFocus()
  fresh.value = false
  point.value = { lon: position.lon, lat: position.lat }
  selecting.value = false
  visible.value = true
  emit('opened')
  await nextTick()
  shell.value?.focus()
}
function startSelection() {
  rememberFocus()
  fresh.value = false
  point.value = null
  visible.value = true
  selecting.value = true
  emit('opened')
  void nextTick(() => shell.value?.focus())
}
function close(restoreFocus = true) {
  visible.value = false
  selecting.value = false
  emit('closed')
  if (restoreFocus)
    void nextTick(() => {
      if (previousFocus?.isConnected && previousFocus.getClientRects().length) previousFocus.focus()
      else
        document
          .querySelector<HTMLElement>('[aria-label="展开工作台"], [aria-label="切换控制面板"]')
          ?.focus()
    })
}
function keydown(event: KeyboardEvent) {
  if (
    event.key === 'Escape' &&
    visible.value &&
    !document.querySelector('[role=combobox][aria-expanded=true]')
  ) {
    event.stopImmediatePropagation()
    close()
  }
}
function analysis() {
  close(false)
  emit('analysis')
}
function clearMarker() {
  if (marker) manager.value?.viewer.entities.remove(marker)
  marker = undefined
}
watch(
  [manager, visible, point, () => props.earthMode],
  ([instance]) => {
    offPick?.()
    offPick = undefined
    clearMarker()
    if (!instance || !visible.value) return
    offPick = instance.pick.on('click', ({ lonLatHeight }) => {
      point.value = { lon: lonLatHeight.lon, lat: lonLatHeight.lat }
      selecting.value = false
      void nextTick(() => shell.value?.focus())
    })
    if (point.value && !props.earthMode)
      marker = instance.viewer.entities.add({
        id: 'rain-forecast-point',
        position: Cesium.Cartesian3.fromDegrees(point.value.lon, point.value.lat),
        point: {
          pixelSize: 10,
          color: Cesium.Color.CYAN,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          disableDepthTestDistance: Infinity
        }
      })
    instance.viewer.scene.requestRender()
  },
  { immediate: true }
)
watch(
  () => props.earthMode,
  () => close(false)
)
watch(
  manager,
  (instance) => {
    offExtension?.()
    if (!instance) return
    offExtension = instance.snapshots.registerExtension('rain-forecast', {
      capture: () => ({ point: point.value, open: visible.value, mode: mode.value }),
      restore(saved) {
        close(false)
        if (!saved || typeof saved !== 'object') throw new Error('降雨预报状态格式错误')
        const value = saved as Record<string, unknown>
        if (typeof value.open !== 'boolean' || !['online', 'demo'].includes(String(value.mode)))
          throw new Error('降雨预报面板状态非法')
        const location = value.point as { lon: number; lat: number } | null
        if (
          location !== null &&
          (!location ||
            !Number.isFinite(location.lon) ||
            !Number.isFinite(location.lat) ||
            Math.abs(location.lon) > 180 ||
            Math.abs(location.lat) > 90)
        )
          throw new Error('降雨预报保存点位非法')
        point.value = location ? { lon: location.lon, lat: location.lat } : null
        mode.value = value.mode as 'online' | 'demo'
      },
      async afterRestore(saved) {
        const value = saved as { open: boolean }
        await nextTick()
        fresh.value = true
        visible.value = value.open
        selecting.value = value.open && !point.value
        if (visible.value) emit('opened')
      }
    })
  },
  { immediate: true }
)
onMounted(() => document.addEventListener('keydown', keydown, true))
onBeforeUnmount(() => {
  offPick?.()
  offExtension?.()
  clearMarker()
  document.removeEventListener('keydown', keydown, true)
})
defineExpose({ open, startSelection, close })
</script>

<template>
  <aside
    v-if="visible"
    ref="shell"
    class="rain-workspace"
    :class="{ 'rain-earth': earthMode, 'rain-selecting': selecting }"
    aria-label="降雨预报侧栏"
    tabindex="-1"
  >
    <div v-if="selecting" class="rain-select-prompt" role="region" aria-label="降雨预报">
      <strong>降雨预报 · 地图选点</strong>
      <button type="button" aria-label="关闭降雨预报" @click="close()">×</button>
      <p>点击地图固定一个位置，随后加载预报。</p>
    </div>
    <RainForecastPanel
      v-else
      v-model:mode="mode"
      :point="point"
      :earth-mode="earthMode"
      :fresh="fresh"
      @close="close()"
      @select="startSelection"
      @analysis="analysis"
    />
  </aside>
</template>

<style scoped>
.rain-workspace {
  position: absolute;
  z-index: 30;
  top: 16px;
  right: 16px;
  bottom: 60px;
  width: 410px;
  max-width: calc(100% - 32px);
  overflow: auto;
  border-radius: 10px;
  border: 1px solid #ffffff28;
  background: #101a2bf5;
  box-shadow: 0 12px 35px #0006;
  color-scheme: dark;
}
.rain-workspace:focus-visible {
  outline: 2px solid #77d6b7;
}
.rain-earth {
  top: 116px;
  bottom: 100px;
}
.rain-selecting {
  bottom: auto;
  width: 280px;
}
@media (max-width: 720px) {
  .rain-workspace {
    top: auto;
    left: 12px;
    right: 12px;
    bottom: calc(52px + env(safe-area-inset-bottom));
    width: auto;
    max-width: none;
    max-height: 55%;
  }
  .rain-earth {
    bottom: calc(136px + env(safe-area-inset-bottom));
    max-height: 48%;
  }
  .rain-selecting {
    bottom: calc(52px + env(safe-area-inset-bottom));
    width: auto;
    max-height: 100px;
  }
  .rain-selecting.rain-earth {
    bottom: calc(136px + env(safe-area-inset-bottom));
  }
}
@media (max-height: 500px) and (min-width: 721px) {
  .rain-earth {
    top: 120px;
    bottom: 84px;
  }
}
.rain-select-prompt {
  position: relative;
  padding: 12px;
  font-size: 12px;
}
.rain-select-prompt button {
  position: absolute;
  right: 10px;
  top: 8px;
  border: 0;
  background: transparent;
  color: #e5edf6;
  cursor: pointer;
  font-size: 18px;
}
.rain-select-prompt button:focus-visible {
  outline: 2px solid #77d6b7;
  outline-offset: 2px;
}
.rain-select-prompt p {
  margin: 8px 0 0;
  color: #a5b5c8;
}
</style>
