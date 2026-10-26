<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { WindPower } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useClock, useViewer } from '@sgyx/cesium-kit-vue'
import {
  createWindFarmFeature,
  createWindFieldFeature,
  sampleTimeSeries,
  type WindFarmFeature,
  type WindFieldFeature,
  type WindTurbine
} from '@sgyx/cesium-kit-wind'

const { manager } = useViewer()
const { state } = useClock()

const fieldEnabled = ref(false)
const farmEnabled = ref(false)
const loading = ref('')
const selected = ref<WindTurbine | null>(null)

const particleSize = ref(96)
const speedFactor = ref(1.5)
const particleHeight = ref(50000)
const dynamic = ref(true)

const fieldFeature = shallowRef<WindFieldFeature | null>(null)
const farmFeature = shallowRef<WindFarmFeature | null>(null)

const colors = ['#ffffff']

const statusText: Record<string, string> = {
  running: '运行',
  stopped: '停机',
  maintenance: '检修',
  fault: '故障'
}

const currentTime = computed(() => state.value?.currentTime ?? new Date())

const currentPower = computed(() =>
  selected.value ? sampleTimeSeries(selected.value.power, currentTime.value) : undefined
)

const currentPowerText = computed(() => {
  const power = currentPower.value
  if (power === undefined) return '-'
  return power >= 1000 ? `${(power / 1000).toFixed(2)} MW` : `${Math.round(power)} kW`
})

function fieldOptions() {
  return {
    data: '/data/wind.json',
    particlesTextureSize: particleSize.value,
    speedFactor: speedFactor.value,
    particleHeight: particleHeight.value,
    dynamic: dynamic.value,
    followClock: false,
    flyTo: false,
    showSpeedOverlay: true,
    speedOverlayAlpha: 0.78,
    colors
  }
}

async function syncWindSampler() {
  if (fieldEnabled.value && farmEnabled.value) {
    farmFeature.value?.setWindSampler(
      (lon, lat) => fieldFeature.value?.getDataAtLonLat(lon, lat) ?? null
    )
  } else {
    farmFeature.value?.setWindSampler(undefined)
  }
}

async function onField(enabled: boolean) {
  const instance = manager.value
  if (!instance) return
  loading.value = enabled ? 'field' : ''
  try {
    if (enabled) {
      const feature = createWindFieldFeature(fieldOptions())
      await instance.features.register(feature)
      fieldFeature.value = feature
      instance.camera.setView({ lon: 120, lat: 32, height: 2_500_000 })
    } else {
      if (fieldFeature.value) instance.features.unregister(fieldFeature.value.name)
      fieldFeature.value = null
    }
    fieldEnabled.value = enabled
    await syncWindSampler()
  } catch (error) {
    fieldEnabled.value = false
    ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally {
    loading.value = ''
  }
}

async function onFarm(enabled: boolean) {
  const instance = manager.value
  if (!instance) return
  loading.value = enabled ? 'farm' : ''
  try {
    if (enabled) {
      const feature = createWindFarmFeature({
        turbines: '/data/turbines.json',
        label: { fields: ['name', 'power'] },
        onSelect: (turbine) => {
          selected.value = turbine
        }
      })
      await instance.features.register(feature)
      farmFeature.value = feature
      await syncWindSampler()
    } else {
      if (farmFeature.value) instance.features.unregister(farmFeature.value.name)
      farmFeature.value = null
      selected.value = null
    }
    farmEnabled.value = enabled
  } catch (error) {
    farmEnabled.value = false
    ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally {
    loading.value = ''
  }
}

watch([particleSize, speedFactor, particleHeight, dynamic], () => {
  fieldFeature.value?.updateOptions({
    particlesTextureSize: particleSize.value,
    speedFactor: speedFactor.value,
    particleHeight: particleHeight.value,
    dynamic: dynamic.value
  })
})
</script>

<template>
  <el-card class="cesium-panel" shadow="always" :body-style="{ padding: '16px' }">
    <template #header>
      <div class="panel-title">
        <el-icon><WindPower /></el-icon>
        <span>风场</span>
      </div>
    </template>

    <div class="row">
      <el-switch
        :model-value="fieldEnabled"
        size="small"
        :loading="loading === 'field'"
        active-text="气象风场"
        inline-prompt
        @update:model-value="onField(Boolean($event))"
      />
      <el-switch
        :model-value="farmEnabled"
        size="small"
        :loading="loading === 'farm'"
        active-text="风电场"
        inline-prompt
        @update:model-value="onFarm(Boolean($event))"
      />
    </div>

    <div class="field">
      <div class="field-label">粒子数量：{{ particleSize }}²</div>
      <el-slider v-model="particleSize" :min="64" :max="256" :step="32" size="small" />
    </div>

    <div class="field">
      <div class="field-label">速度倍率：{{ speedFactor.toFixed(1) }}</div>
      <el-slider v-model="speedFactor" :min="0.2" :max="3" :step="0.1" size="small" />
    </div>

    <div class="field">
      <div class="field-label">粒子高度：{{ particleHeight }} m</div>
      <el-slider v-model="particleHeight" :min="0" :max="100000" :step="5000" size="small" />
    </div>

    <div class="field">
      <div class="field-label">动画</div>
      <el-switch v-model="dynamic" size="small" active-text="播放粒子" inline-prompt />
    </div>

    <div v-if="selected" class="selected">
      <div class="selected-title">{{ selected.name || selected.id }}</div>
      <div class="selected-row">状态：{{ statusText[selected.status || 'running'] }}</div>
      <div class="selected-row">功率：{{ currentPowerText }}</div>
      <div class="selected-row">
        坐标：{{ selected.lon.toFixed(3) }}, {{ selected.lat.toFixed(3) }}
      </div>
    </div>

    <p class="hint">
      气象风场使用 GPU 粒子；风电场为 Billboard + Label，点击风机查看详情。
    </p>
  </el-card>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.selected {
  margin-top: 4px;
  padding: 10px 12px;
  border-radius: 6px;
  background: rgba(103, 194, 58, 0.08);
  border: 1px solid rgba(103, 194, 58, 0.25);
}

.selected-title {
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #67c23a;
}

.selected-row {
  font-size: 12px;
  line-height: 1.6;
  color: #d1d5db;
}

.hint {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #9ca3af;
}
</style>
