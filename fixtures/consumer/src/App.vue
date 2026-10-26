<script setup lang="ts">
import { CesiumViewer } from '@sgyx/cesium-kit-vue'
import type { CesiumViewerManager } from '@sgyx/cesium-kit-core'
import Panel from './Panel.vue'

function onReady(manager: CesiumViewerManager) {
  ;(window as unknown as Record<string, unknown>).__consumer = manager
}
</script>

<template>
  <div style="height: 100%">
    <CesiumViewer base-layer="naturalEarth" @ready="onReady">
      <Panel />
    </CesiumViewer>
  </div>
</template>
