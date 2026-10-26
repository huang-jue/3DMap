<script setup lang="ts">
import { EditPen } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useDraw } from '@sgyx/cesium-kit-vue'
import {
  formatArea,
  formatDistance,
  formatHeight,
  type DrawResult,
  type DrawType
} from '@sgyx/cesium-kit-core'

const { drawing, results, start, clear } = useDraw()

const tools: Array<{ type: DrawType; label: string }> = [
  { type: 'point', label: '点' },
  { type: 'polyline', label: '线' },
  { type: 'polygon', label: '面' },
  { type: 'rectangle', label: '矩形' },
  { type: 'circle', label: '圆' },
  { type: 'height', label: '高差' }
]

async function onStart(type: DrawType) {
  try {
    await start(type, { editable: true })
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

function summaryText(result: DrawResult): string {
  const parts: string[] = []
  const measurement = result.measurement
  if (measurement.distance !== undefined) {
    parts.push(formatDistance(measurement.distance))
  }
  if (measurement.area !== undefined) {
    parts.push(formatArea(measurement.area))
  }
  if (measurement.radius !== undefined) {
    parts.push(`半径 ${formatDistance(measurement.radius)}`)
  }
  if (measurement.heightDiff !== undefined) {
    parts.push(`高差 ${formatHeight(measurement.heightDiff)}`)
  }
  return parts.join(' · ') || '已完成'
}

const typeText: Record<DrawType, string> = {
  point: '点',
  polyline: '线',
  polygon: '面',
  rectangle: '矩形',
  circle: '圆',
  height: '高差'
}
</script>

<template>
  <el-card class="cesium-panel" shadow="always" :body-style="{ padding: '16px' }">
    <template #header>
      <div class="panel-title">
        <el-icon><EditPen /></el-icon>
        <span>绘制与量算</span>
      </div>
    </template>

    <div class="tool-grid">
      <el-button
        v-for="tool in tools"
        :key="tool.type"
        size="small"
        :type="drawing ? 'default' : 'primary'"
        plain
        @click="onStart(tool.type)"
      >
        {{ tool.label }}
      </el-button>
    </div>

    <p class="hint">左键加点，双击或右键结束，Esc 取消；完成后可拖拽黄色顶点编辑。</p>

    <div v-if="results.length > 0" class="results">
      <div v-for="result in results" :key="result.id" class="result-row">
        <span class="result-type">{{ typeText[result.type] }}</span>
        <span class="result-value">{{ summaryText(result) }}</span>
      </div>
    </div>

    <div class="actions">
      <el-button size="small" :disabled="results.length === 0" @click="clear()">
        清空绘制
      </el-button>
    </div>
  </el-card>
</template>

<style scoped>
.tool-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.tool-grid :deep(.el-button) {
  margin-left: 0;
}

.hint {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #9ca3af;
}

.results {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.result-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  line-height: 1.8;
}

.result-type {
  flex: none;
  min-width: 28px;
  color: #67c23a;
}

.result-value {
  color: #d1d5db;
}

.actions {
  margin-top: 12px;
}
</style>
