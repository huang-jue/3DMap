<script setup lang="ts">
import { computed } from 'vue'
import { usePick } from '@sgyx/cesium-kit-vue'

const { last, hovered } = usePick({ hoverInterval: 120 })

const current = computed(() => last.value ?? hovered.value)
</script>

<template>
  <div class="pick-overlay">
    <template v-if="current">
      <span class="coord">
        {{ current.lonLatHeight.lon.toFixed(5) }}, {{ current.lonLatHeight.lat.toFixed(5) }}
      </span>
      <span class="meta">{{ Math.round(current.lonLatHeight.height ?? 0) }} m</span>
      <span v-if="current.entity" class="meta">
        实体：{{ current.entity.name || current.entity.id }}
      </span>
    </template>
    <template v-else>
      <span class="meta">点击地图查看坐标</span>
    </template>
  </div>
</template>

<style scoped>
.pick-overlay {
  position: absolute;
  left: 16px;
  bottom: 16px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(17, 24, 39, 0.82);
  backdrop-filter: blur(6px);
  color: #e5e7eb;
  font: 12px/1.4 'SFMono-Regular', Consolas, monospace;
  pointer-events: none;
}

.coord {
  color: #67c23a;
}

.meta {
  color: #9ca3af;
}
</style>
