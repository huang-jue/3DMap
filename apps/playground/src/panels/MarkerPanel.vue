<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChatDotRound } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useMarkerCluster, usePopup } from '@sgyx/cesium-kit-vue'
import type { MarkerInput } from '@sgyx/cesium-kit-core'

const enabled = ref(false)
const { open, closeAll } = usePopup()

const CITIES: MarkerInput[] = [
  {
    id: 'beijing',
    position: { lon: 116.3913, lat: 39.9075 },
    name: '北京',
    label: '北京',
    data: { description: '全国政治、文化与国际交往中心' }
  },
  {
    id: 'shanghai',
    position: { lon: 121.4737, lat: 31.2304 },
    name: '上海',
    label: '上海',
    data: { description: '国际经济、金融、贸易与航运中心' }
  },
  {
    id: 'guangzhou',
    position: { lon: 113.2644, lat: 23.1291 },
    name: '广州',
    label: '广州',
    data: { description: '粤港澳大湾区核心城市' }
  },
  {
    id: 'chengdu',
    position: { lon: 104.0665, lat: 30.5728 },
    name: '成都',
    label: '成都',
    data: { description: '成渝地区双城经济圈核心城市' }
  },
  {
    id: 'wuhan',
    position: { lon: 114.3055, lat: 30.5928 },
    name: '武汉',
    label: '武汉',
    data: { description: '长江中游城市群核心城市' }
  },
  {
    id: 'xian',
    position: { lon: 108.9398, lat: 34.3416 },
    name: '西安',
    label: '西安',
    data: { description: '关中平原城市群核心城市' }
  }
]

function cityContent(marker: MarkerInput): string {
  const data = marker.data as { description?: string } | undefined
  const lon = marker.position && 'lon' in marker.position ? marker.position.lon : 0
  const lat = marker.position && 'lat' in marker.position ? marker.position.lat : 0
  return `
    <div>
      <div style="font-size:12px;color:#6b7280">${data?.description ?? '示例标注'}</div>
      <div style="margin-top:6px;font-family:monospace;font-size:12px">
        ${lon.toFixed(4)}, ${lat.toFixed(4)}
      </div>
    </div>
  `
}

async function openCityPopup(marker: MarkerInput) {
  await open({
    id: 'demo-city-popup',
    position: marker.position,
    title: marker.name ?? '城市标注',
    content: cityContent(marker),
    offset: [0, -16]
  })
}

const { layer, addMany, clear } = useMarkerCluster({
  id: 'demo-city-markers',
  name: '城市标注',
  layerGroup: '城市标注',
  pixelRange: 80,
  minimumClusterSize: 2,
  clusterColor: '#2563eb',
  onMarkerClick: (marker) => {
    void openCityPopup(marker)
  }
})

const markerCount = computed(() => layer.value?.size ?? 0)

async function onToggle(value: boolean) {
  try {
    if (value) await addMany(CITIES)
    else await clear()
    enabled.value = value
  } catch (error) {
    enabled.value = false
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

async function openDemoPopup() {
  await open({
    id: 'demo-fixed-popup',
    position: { lon: 116.3913, lat: 39.9075, height: 60 },
    title: '示例弹窗',
    content:
      '<div style="font-size:12px;line-height:1.6">弹窗跟随地图坐标移动，支持标题、HTML 内容与多弹窗。</div>',
    offset: [0, -16]
  })
}
</script>

<template>
  <el-card class="cesium-panel" shadow="always" :body-style="{ padding: '16px' }">
    <template #header>
      <div class="panel-title">
        <el-icon><ChatDotRound /></el-icon>
        <span>标注与弹窗</span>
      </div>
    </template>

    <div class="row">
      <el-switch
        :model-value="enabled"
        size="small"
        active-text="城市标注聚合"
        inline-prompt
        @update:model-value="onToggle(Boolean($event))"
      />
      <span class="meta">{{ markerCount }} 个</span>
    </div>

    <div class="actions">
      <el-button size="small" @click="openDemoPopup()">打开示例弹窗</el-button>
      <el-button size="small" @click="closeAll()">关闭全部</el-button>
    </div>

    <p class="hint">
      开启后缩放地图查看聚合效果；点击单体标注打开弹窗，点击聚合点自动放大。
    </p>
  </el-card>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.meta {
  color: #9ca3af;
  font-size: 12px;
}

.actions {
  display: flex;
  gap: 8px;
}

.actions :deep(.el-button) {
  margin-left: 0;
}

.hint {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #9ca3af;
}
</style>
