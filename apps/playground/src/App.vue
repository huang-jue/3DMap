<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { Aim, Expand, Fold, MapLocation } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { CesiumViewer } from '@sgyx/cesium-kit-vue'
import type {
  CameraView,
  CesiumKitErrorPayload,
  CesiumViewerManager,
  SceneModeName
} from '@sgyx/cesium-kit-core'
import { markersFeature } from './features/markersFeature'
import ScenePanel from './panels/ScenePanel.vue'
import TimePanel from './panels/TimePanel.vue'
import LayerPanel from './panels/LayerPanel.vue'
import LayerTreePanel from './panels/LayerTreePanel.vue'
import DrawPanel from './panels/DrawPanel.vue'
import MarkerPanel from './panels/MarkerPanel.vue'
import FloodPanel from './panels/FloodPanel.vue'
import EarthPanel from './panels/EarthPanel.vue'
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
const panelOpen = ref(true)
const earthMode = ref(false)
const camera = reactive<CameraView>({
  lon: 0,
  lat: 0,
  height: 0,
  heading: 0,
  pitch: 0,
  roll: 0
})

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
        <el-button :type="earthMode ? 'primary' : 'default'" @click="earthMode = !earthMode">
          {{ earthMode ? '退出地球模式' : '地球模式' }}
        </el-button>
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
        <div v-if="!earthMode" class="workbench" :class="{ collapsed: !panelOpen }">
          <div class="workbench-head">
            <span v-if="panelOpen" class="workbench-title">工作台</span>
            <el-button
              :icon="panelOpen ? Fold : Expand"
              size="small"
              text
              :title="panelOpen ? '收起工作台' : '展开工作台'"
              @click="panelOpen = !panelOpen"
            />
          </div>
          <div v-show="panelOpen" class="panel-scroll">
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
            <FloodPanel />
          </div>
        </div>
        <EarthPanel v-if="earthMode" @close="earthMode = false" />
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

.workbench {
  position: absolute;
  top: 16px;
  left: 16px;
  bottom: 16px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 420px;
  max-width: calc(100vw - 32px);
  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(11, 16, 32, 0.88);
  backdrop-filter: blur(14px);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
}

.workbench.collapsed {
  bottom: auto;
  width: auto;
  padding: 6px;
  background: rgba(17, 24, 39, 0.92);
}

.workbench-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 28px;
}

.workbench-title {
  color: #e5e7eb;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 1px;
}

.panel-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-right: 4px;
}

.panel-scroll::-webkit-scrollbar {
  width: 6px;
}

.panel-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.18);
  border-radius: 3px;
}

.panel-scroll :deep(.cesium-panel),
.panel-scroll :deep(.selection-panel),
.panel-scroll :deep(.flood-panel) {
  width: 100% !important;
}

.panel-scroll :deep(.hint) {
  font-size: 13px;
  line-height: 1.6;
}

@media (max-width: 720px) {
  .workbench {
    top: 12px;
    left: 12px;
    bottom: 12px;
    width: min(420px, calc(100vw - 24px));
  }
}
</style>
