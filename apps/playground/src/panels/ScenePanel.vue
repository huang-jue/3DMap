<script setup lang="ts">
import { ref } from 'vue'
import { Camera, Picture, View } from '@element-plus/icons-vue'
import { useViewer } from '@cesium-kit/vue'
import type { CameraView, SceneModeName } from '@cesium-kit/core'

const props = defineProps<{
  baseLayer: string
  sceneMode: SceneModeName
  pluginEnabled: boolean
  view: CameraView | null
}>()

const emit = defineEmits<{
  'update:baseLayer': [id: string]
  'update:sceneMode': [mode: SceneModeName]
  'update:pluginEnabled': [enabled: boolean]
  'share': []
  'screenshot-error': [message: string]
}>()

const { manager } = useViewer()

const skyBox = ref(true)
const sun = ref(true)
const atmosphere = ref(true)

const baseLayers = [
  { value: 'naturalEarth', label: '自然地球' },
  { value: 'osm', label: 'OpenStreetMap' }
]

const sceneModes: Array<{ value: SceneModeName; label: string }> = [
  { value: '3D', label: '三维' },
  { value: '2D', label: '二维' },
  { value: 'COLUMBUS_VIEW', label: '哥伦布视图' }
]

function takeScreenshot() {
  const instance = manager.value
  if (!instance) return
  try {
    const { dataUrl } = instance.scene.screenshot()
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `cesium-${Date.now()}.png`
    link.click()
  } catch (error) {
    emit('screenshot-error', error instanceof Error ? error.message : String(error))
  }
}

function onSkyBox(value: boolean) {
  skyBox.value = value
  manager.value?.scene.setSkyBox(value)
}

function onSun(value: boolean) {
  sun.value = value
  manager.value?.scene.setSun(value)
}

function onAtmosphere(value: boolean) {
  atmosphere.value = value
  manager.value?.scene.setSkyAtmosphere(value)
}
</script>

<template>
  <el-card class="cesium-panel" shadow="always" :body-style="{ padding: '16px' }">
    <template #header>
      <div class="panel-title">
        <el-icon><View /></el-icon>
        <span>场景控制</span>
      </div>
    </template>

    <div class="field">
      <div class="field-label">底图</div>
      <el-radio-group
        :model-value="props.baseLayer"
        size="small"
        @update:model-value="emit('update:baseLayer', $event as string)"
      >
        <el-radio-button v-for="item in baseLayers" :key="item.value" :value="item.value">
          {{ item.label }}
        </el-radio-button>
      </el-radio-group>
    </div>

    <div class="field">
      <div class="field-label">投影</div>
      <el-radio-group
        :model-value="props.sceneMode"
        size="small"
        @update:model-value="emit('update:sceneMode', $event as SceneModeName)"
      >
        <el-radio-button v-for="item in sceneModes" :key="item.value" :value="item.value">
          {{ item.label }}
        </el-radio-button>
      </el-radio-group>
    </div>

    <div class="field">
      <div class="field-label">插件</div>
      <el-switch
        :model-value="props.pluginEnabled"
        size="small"
        active-text="城市标注插件"
        inline-prompt
        @update:model-value="emit('update:pluginEnabled', Boolean($event))"
      />
    </div>

    <div class="field">
      <div class="field-label">视觉</div>
      <div class="toggles">
        <el-checkbox :model-value="skyBox" size="small" @update:model-value="onSkyBox(!!$event)">
          星空
        </el-checkbox>
        <el-checkbox :model-value="sun" size="small" @update:model-value="onSun(!!$event)">
          太阳
        </el-checkbox>
        <el-checkbox
          :model-value="atmosphere"
          size="small"
          @update:model-value="onAtmosphere(!!$event)"
        >
          大气
        </el-checkbox>
      </div>
    </div>

    <el-divider content-position="left">
      <el-icon><Camera /></el-icon>
      <span class="divider-text">相机</span>
    </el-divider>

    <el-descriptions :column="1" size="small" border>
      <el-descriptions-item label="经度">
        {{ (props.view?.lon ?? 0).toFixed(5) }}°
      </el-descriptions-item>
      <el-descriptions-item label="纬度">
        {{ (props.view?.lat ?? 0).toFixed(5) }}°
      </el-descriptions-item>
      <el-descriptions-item label="高度">
        {{ Math.round(props.view?.height ?? 0).toLocaleString() }} m
      </el-descriptions-item>
      <el-descriptions-item label="俯仰">
        {{ (props.view?.pitch ?? 0).toFixed(1) }}°
      </el-descriptions-item>
    </el-descriptions>

    <div class="actions">
      <el-button-group size="small">
        <el-button :icon="Picture" @click="takeScreenshot">截图</el-button>
        <el-button @click="emit('share')">复制视角链接</el-button>
      </el-button-group>
    </div>
  </el-card>
</template>

<style scoped>
.actions {
  margin-top: 12px;
}
</style>
