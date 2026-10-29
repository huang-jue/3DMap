<script setup lang="ts">
withDefaults(defineProps<{ title: string; initialOpen?: boolean }>(), { initialOpen: false })
</script>
<template>
  <details class="workbench-section" :open="initialOpen">
    <summary>{{ title }}</summary>
    <div class="workbench-section-body"><slot /></div>
  </details>
</template>
<style scoped>
.workbench-section {
  min-width: 0;
  border: 1px solid #ffffff18;
  border-radius: 8px;
  background: #111827c9;
}
summary {
  padding: 12px;
  cursor: pointer;
  color: #e5e7eb;
  font-size: 13px;
  font-weight: 600;
}
.workbench-section-body {
  min-width: 0;
}
</style>
