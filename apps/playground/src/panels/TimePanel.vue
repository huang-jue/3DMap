<script setup lang="ts">
import { computed, ref } from 'vue'
import { DArrowLeft, DArrowRight, Timer, VideoPause, VideoPlay } from '@element-plus/icons-vue'
import { useClock, useViewer } from '@sgyx/cesium-kit-vue'
import { ElMessage } from 'element-plus'
import { waterLevelFeature } from '../features/waterLevelFeature'

const { state, toggle, setMultiplier, stepForward, stepBackward } = useClock()
const { manager } = useViewer()

const speed = ref(21600)
const waterEnabled = ref(false)

const speedOptions = [
  { value: 1, label: '1x' },
  { value: 60, label: '1 分钟/秒' },
  { value: 3600, label: '1 小时/秒' },
  { value: 21600, label: '6 小时/秒' },
  { value: 86400, label: '1 天/秒' }
]

const timeText = computed(() => {
  const date = state.value?.currentTime
  if (!date) return '-'
  return date.toISOString().slice(0, 19).replace('T', ' ')
})

const running = computed(() => state.value?.running ?? false)
const multiplier = computed(() => state.value?.multiplier ?? 1)

async function onSpeed(value: number) {
  speed.value = value
  await setMultiplier(value)
}

async function onWater(enabled: boolean) {
  const instance = manager.value
  if (!instance) return
  try {
    if (enabled) {
      await instance.features.register(waterLevelFeature)
    } else {
      instance.features.unregister(waterLevelFeature.name)
    }
    waterEnabled.value = enabled
  } catch (error) {
    waterEnabled.value = false
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}
</script>

<template>
  <el-card class="cesium-panel" shadow="always" :body-style="{ padding: '16px' }">
    <template #header>
      <div class="panel-title">
        <el-icon><Timer /></el-icon>
        <span>时间轴</span>
      </div>
    </template>

    <div class="time mono">{{ timeText }}</div>

    <div class="controls">
      <el-button-group size="small">
        <el-button :icon="DArrowLeft" @click="stepBackward()" />
        <el-button :icon="running ? VideoPause : VideoPlay" @click="toggle()">
          {{ running ? '暂停' : '播放' }}
        </el-button>
        <el-button :icon="DArrowRight" @click="stepForward()" />
      </el-button-group>
      <span class="meta mono">{{ multiplier }}x</span>
    </div>

    <div class="field">
      <div class="field-label">倍速</div>
      <el-select :model-value="speed" size="small" @update:model-value="onSpeed(Number($event))">
        <el-option
          v-for="item in speedOptions"
          :key="item.value"
          :value="item.value"
          :label="item.label"
        />
      </el-select>
    </div>

    <div class="field">
      <div class="field-label">业务插件</div>
      <el-switch
        :model-value="waterEnabled"
        size="small"
        active-text="水位演进演示"
        inline-prompt
        @update:model-value="onWater(Boolean($event))"
      />
    </div>
  </el-card>
</template>

<style scoped>
.time {
  padding: 8px 10px;
  margin-bottom: 12px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
  color: #67c23a;
  font-size: 13px;
}

.controls {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.meta {
  color: #9ca3af;
}

.field :deep(.el-select) {
  width: 100%;
}
</style>
