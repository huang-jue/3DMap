<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { Aim, MapLocation } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { CesiumViewer } from '@cesium-kit/vue'
import type {
  CameraView,
  CesiumKitErrorPayload,
  CesiumViewerManager,
  SceneModeName
} from '@cesium-kit/core'
import { markersFeature } from './features/markersFeature'
import ScenePanel from './panels/ScenePanel.vue'
import TimePanel from './panels/TimePanel.vue'
import LayerPanel from './panels/LayerPanel.vue'
import LayerTreePanel from './panels/LayerTreePanel.vue'
import DrawPanel from './panels/DrawPanel.vue'
import MarkerPanel from './panels/MarkerPanel.vue'
import WindPanel from './panels/WindPanel.vue'
import WeatherPanel from './panels/WeatherPanel.vue'
import PersistencePanel from './panels/PersistencePanel.vue'
import SelectionPanel from './panels/SelectionPanel.vue'
import PickOverlay from './panels/PickOverlay.vue'

interface CesiumViewerExposed {
  manager: CesiumViewerManager | null
  whenReady(): Promise<CesiumViewerManager>
  init(): Promise<CesiumViewerManager | null>
  destroy(): void
  flyHome(duration?: number): void
  setSceneMode(mode: SceneModeName, duration?: number): void
  switchBaseLayer(id: string | null): void
}

const mapRef = ref<CesiumViewerExposed | null>(null)
const baseLayer = ref('naturalEarth')
const sceneMode = ref<SceneModeName>('3D')
const pluginEnabled = ref(false)
const camera = reactive<CameraView>({
  lon: 0,
  lat: 0,
  height: 0,
  heading: 0,
  pitch: 0,
  roll: 0
})

const windEnabled = import.meta.env.VITE_ENABLE_WIND !== 'false'

const viewerOptions = {
  showCredits: false,
  preserveDrawingBuffer: true,
  verifyAssets: true,
  ionToken: import.meta.env.VITE_CESIUM_ION_TOKEN || undefined,
  homeOrientation: { pitch: -90 }
}

function onCameraChange(info: CameraView) {
  Object.assign(camera, info)
}

function onError(payload: CesiumKitErrorPayload) {
  const message =
    payload.detail ?? (payload.error instanceof Error ? payload.error.message : '未知错误')
  ElMessage.error(`[${payload.source}] ${message}`)
}

function onScreenshotError(message: string) {
  ElMessage.error(message)
}

function onReady(manager: CesiumViewerManager) {
  if (import.meta.env.DEV) {
    ;(window as unknown as Record<string, unknown>).__cesiumKit = manager
  }
}

async function shareView() {
  const manager = await mapRef.value?.whenReady()
  const url = manager?.camera.getShareUrl(location.href)
  if (!url) return
  try {
    await navigator.clipboard.writeText(url)
    ElMessage.success('视角链接已复制')
  } catch {
    ElMessage.warning(`复制失败，可手动复制：${url}`)
  }
}

watch(pluginEnabled, async (enabled) => {
  const manager = await mapRef.value?.whenReady()
  if (!manager) return
  if (enabled) {
    await manager.features.register(markersFeature)
  } else {
    manager.features.unregister(markersFeature.name)
  }
})
</script>

<template>
  <div class="layout">
    <header class="header">
      <div class="brand">
        <el-icon :size="22"><MapLocation /></el-icon>
        <span>三维地图</span>
      </div>
      <div class="actions">
        <el-button :icon="Aim" @click="mapRef?.flyHome()">复位视角</el-button>
      </div>
    </header>

    <main class="main">
      <CesiumViewer
        ref="mapRef"
        v-model:base-layer="baseLayer"
        v-model:scene-mode="sceneMode"
        :options="viewerOptions"
        @ready="onReady"
        @error="onError"
        @camera-change="onCameraChange"
      >
        <div class="panel-column">
          <ScenePanel
            v-model:base-layer="baseLayer"
            v-model:scene-mode="sceneMode"
            v-model:plugin-enabled="pluginEnabled"
            :view="camera"
            @share="shareView"
            @screenshot-error="onScreenshotError"
          />
          <TimePanel />
          <DrawPanel />
          <PersistencePanel />
          <SelectionPanel />
          <LayerPanel />
          <LayerTreePanel />
          <MarkerPanel />
          <WeatherPanel />
          <WindPanel v-if="windEnabled" />
        </div>
        <PickOverlay />
      </CesiumViewer>
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #0b1020;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 20px;
  background: #111827;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  color: #e5e7eb;
  z-index: 10;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 1px;
}

.main {
  position: relative;
  flex: 1;
  min-height: 0;
}

.panel-column {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: calc(100% - 32px);
  overflow-y: auto;
  padding-right: 2px;
}

.panel-column::-webkit-scrollbar {
  width: 6px;
}

.panel-column::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.18);
  border-radius: 3px;
}
</style>
