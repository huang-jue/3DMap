<script setup lang="ts">
import { useSelection } from '@sgyx/cesium-kit-vue'
const { selected, clear } = useSelection()
function valueText(value: unknown): string {
  try {
    return typeof value === 'string' ? value : (JSON.stringify(value) ?? '')
  } catch {
    return String(value)
  }
}
</script>

<template>
  <section class="cesium-panel selection-panel">
    <h3>要素属性</h3>
    <template v-if="selected">
      <p>
        {{ selected.kind === 'entity' ? '实体' : '3D Tiles 要素' }} ·
        {{ selected.id ?? '无稳定 ID' }}
      </p>
      <p>图层：{{ selected.layerId ?? '独立对象' }}</p>
      <dl>
        <template v-for="(value, key) in selected.properties" :key="key">
          <dt>{{ key }}</dt>
          <dd>{{ valueText(value) }}</dd>
        </template>
      </dl>
      <el-button size="small" @click="clear">清除选择</el-button>
    </template>
    <p v-else>点击实体或模型查看属性</p>
  </section>
</template>

<style scoped>
.selection-panel {
  width: 300px;
  box-sizing: border-box;
  padding: 16px;
  border-radius: 4px;
}
h3 {
  margin: 0 0 12px;
  font-size: 14px;
}
dl {
  display: grid;
  grid-template-columns: minmax(60px, 1fr) 2fr;
  gap: 6px;
  max-height: 180px;
  overflow: auto;
  font-size: 12px;
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
p {
  font-size: 12px;
}
</style>
