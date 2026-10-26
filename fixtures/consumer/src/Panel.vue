<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useCamera, useClock, useEntities, usePick, useSceneMode, useViewer } from '@cesium-kit/vue'
import { createPoint } from '@cesium-kit/core'
import { parseWeatherLayer } from '@cesium-kit/weather'
import { parseWindJson } from '@cesium-kit/wind'

const windPreview = parseWindJson({
  u: [0, 1, 2, 3],
  v: [0, 1, 2, 3],
  width: 2,
  height: 2,
  bounds: { west: 0, south: 0, east: 1, north: 1 }
})

const weatherPreview = parseWeatherLayer({
  kind: 'precip',
  frames: [
    {
      time: '2026-07-01T00:00:00Z',
      bounds: { west: 0, south: 0, east: 1, north: 1 },
      width: 2,
      height: 2,
      values: [0, 1, 2, 3]
    }
  ]
})

const { view, flyHome } = useCamera()
const { add, count } = useEntities()
const { mode, setMode } = useSceneMode()
const { ready } = useViewer()
const { state: clock } = useClock()
const { last } = usePick()
const added = ref(false)

onMounted(async () => {
  await add(
    createPoint({
      id: 'beijing',
      position: { lon: 116.3913, lat: 39.9075 },
      clampToGround: true,
      color: '#67c23a'
    })
  )
  added.value = true
})

function toggleMode() {
  void setMode(mode.value === '3D' ? '2D' : '3D')
}
</script>

<template>
  <div class="panel">
    <div>ready: {{ ready }}</div>
    <div>mode: {{ mode }}</div>
    <div>entities: {{ count }} {{ added ? '' : '(pending)' }}</div>
    <div>lon: {{ view?.lon.toFixed(4) }}</div>
    <div>lat: {{ view?.lat.toFixed(4) }}</div>
    <div>height: {{ Math.round(view?.height ?? 0) }}</div>
    <div>clock: {{ clock?.currentTime.toISOString() }}</div>
    <div>pick: {{ last ? last.lonLatHeight.lon.toFixed(4) : '-' }}</div>
    <div>wind: {{ windPreview.width }}×{{ windPreview.height }}</div>
    <div>weather: {{ weatherPreview.kind }} · {{ weatherPreview.frames.length }}</div>
    <button @click="flyHome()">home</button>
    <button @click="toggleMode">toggle-mode</button>
  </div>
</template>

<style scoped>
.panel {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 10;
  padding: 12px;
  background: rgba(0, 0, 0, 0.72);
  color: #fff;
  font: 12px/1.6 monospace;
  border-radius: 6px;
}
</style>
