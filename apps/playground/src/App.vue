<script setup lang="ts">
import { defineAsyncComponent, nextTick, reactive, ref, watch } from 'vue'
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
import WorkbenchSection from './components/WorkbenchSection.vue'
import ScenePanel from './panels/ScenePanel.vue'
import TimePanel from './panels/TimePanel.vue'
import LayerPanel from './panels/LayerPanel.vue'
import LayerTreePanel from './panels/LayerTreePanel.vue'
import DrawPanel from './panels/DrawPanel.vue'
import MarkerPanel from './panels/MarkerPanel.vue'
const FloodPanel = defineAsyncComponent(() => import('./panels/FloodPanel.vue'))
import EarthPanel from './panels/EarthPanel.vue'
import type { EarthWorkspaceState } from './panels/earthUtils'
import { isEarthRoute } from './panels/earthRoute'
import PersistencePanel from './panels/PersistencePanel.vue'
import SelectionPanel from './panels/SelectionPanel.vue'
import PickOverlay from './panels/PickOverlay.vue'
import RainForecastWorkspace from './panels/RainForecastWorkspace.vue'

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
const baseLayer = ref<string | null>('naturalEarth')
const sceneMode = ref<SceneModeName>('3D')
const pluginEnabled = ref(false)
const panelOpen = ref(!window.matchMedia('(max-width: 720px)').matches)
const earthPanelRef = ref<InstanceType<typeof EarthPanel> | null>(null)
const rainRef = ref<InstanceType<typeof RainForecastWorkspace> | null>(null)
const rainActive = ref(false)
const earthMode = ref(isEarthRoute(window.location))
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

function rainOpened() {
  rainActive.value = true
  panelOpen.value = false
}

function openWorkbench() {
  if (!panelOpen.value) rainRef.value?.close(false)
  panelOpen.value = !panelOpen.value
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
  manager.snapshots.registerExtension('earth-workspace', {
    capture: () => (earthMode.value ? earthPanelRef.value?.captureWorkspace() : null),
    async restore(state) {
      if (!state) {
        earthMode.value = false
        await nextTick()
        return
      }
      earthMode.value = true
      await nextTick()
      await earthPanelRef.value?.restoreWorkspace(state as EarthWorkspaceState)
    },
    afterRestore(state) {
      if (state) earthPanelRef.value?.finishRestore(state as EarthWorkspaceState)
    }
  })
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
    <header v-if="!earthMode" class="header">
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
        v-model:scene-mode="sceneMode"
        :base-layer="baseLayer ?? undefined"
        :options="viewerOptions"
        @update:base-layer="baseLayer = $event"
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
              :aria-label="panelOpen ? '收起工作台' : '展开工作台'"
              :aria-expanded="panelOpen"
              @click="openWorkbench"
            />
          </div>
          <div v-show="panelOpen" class="panel-scroll">
            <WorkbenchSection title="场景设置" initial-open>
              <ScenePanel
                v-model:base-layer="baseLayer"
                v-model:scene-mode="sceneMode"
                v-model:plugin-enabled="pluginEnabled"
                :view="camera"
                @share="shareView"
                @screenshot-error="onScreenshotError"
              />
            </WorkbenchSection>
            <WorkbenchSection title="降雨预报">
              <div class="rain-entry">
                <p>选取地图位置，查看未来 48 小时雨量和降雨概率。</p>
                <el-button size="small" @click="rainRef?.startSelection()"
                >
                  地图选点降雨预报
                </el-button
                >
              </div>
            </WorkbenchSection>
            <WorkbenchSection title="时间轴"><TimePanel /></WorkbenchSection>
            <WorkbenchSection title="绘制与量算"><DrawPanel /></WorkbenchSection>
            <WorkbenchSection title="成果与场景"><PersistencePanel /></WorkbenchSection>
            <WorkbenchSection title="要素属性"><SelectionPanel /></WorkbenchSection>
            <WorkbenchSection title="数据加载"><LayerPanel /></WorkbenchSection>
            <WorkbenchSection title="图层管理"><LayerTreePanel /></WorkbenchSection>
            <WorkbenchSection title="标注与聚合"><MarkerPanel /></WorkbenchSection>
            <WorkbenchSection title="水旱灾害防御"><FloodPanel /></WorkbenchSection>
          </div>
        </div>
        <EarthPanel
          v-if="earthMode"
          ref="earthPanelRef"
          :rain-active="rainActive"
          @close="earthMode = false"
          @rain="rainRef?.open($event)"
          @navigate="rainRef?.close(false)"
        />
        <RainForecastWorkspace
          ref="rainRef"
          :earth-mode="earthMode"
          @opened="rainOpened"
          @closed="rainActive = false"
          @analysis="earthPanelRef?.showAnalysis()"
        />
        <PickOverlay v-if="!earthMode" />
      </CesiumViewer>
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  background: #0b1020;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 56px;
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 8px;
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
  bottom: 60px;
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

.rain-entry {
  padding: 0 12px 12px;
  color: #b8c8dc;
  font-size: 12px;
  line-height: 1.6;
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
  .header {
    padding: 8px 12px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .actions :deep(.el-button + .el-button) {
    margin-left: 0;
  }
  .workbench {
    top: auto;
    left: 12px;
    right: 12px;
    bottom: calc(52px + env(safe-area-inset-bottom));
    width: auto;
    max-width: none;
    max-height: 55%;
  }
  .workbench.collapsed {
    right: auto;
  }
}
</style>
