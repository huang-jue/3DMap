<script setup lang="ts">
import { List } from '@element-plus/icons-vue'
import { useLayerManager } from '@cesium-kit/vue'
import type { LayerKind, LayerNode } from '@cesium-kit/core'

const { tree, setVisible, setAlpha, move, remove } = useLayerManager()

const kindLabel: Record<LayerKind, string> = {
  group: '分组',
  imagery: '底图',
  datasource: '数据源',
  tileset: '3D Tiles',
  entities: '实体组',
  custom: '自定义'
}

function findSiblings(
  nodes: LayerNode[],
  id: string,
  parentId: string | null = null
): { siblings: LayerNode[]; parentId: string | null } | null {
  for (const node of nodes) {
    if (node.id === id) return { siblings: nodes, parentId }
    const found = findSiblings(node.children, id, node.id)
    if (found) return found
  }
  return null
}

async function moveBy(node: LayerNode, delta: number) {
  const found = findSiblings(tree.value, node.id)
  if (!found) return
  const index = found.siblings.findIndex((item) => item.id === node.id)
  const next = index + delta
  if (next < 0 || next >= found.siblings.length) return
  await move(node.id, found.parentId ?? 'root', next)
}

async function onVisible(node: LayerNode, visible: boolean) {
  await setVisible(node.id, visible)
}

async function onAlpha(node: LayerNode, value: number | number[]) {
  if (typeof value !== 'number') return
  await setAlpha(node.id, value / 100)
}

async function onRemove(node: LayerNode) {
  await remove(node.id)
}
</script>

<template>
  <el-card class="cesium-panel" shadow="always" :body-style="{ padding: '16px' }">
    <template #header>
      <div class="panel-title">
        <el-icon><List /></el-icon>
        <span>图层树</span>
      </div>
    </template>

    <el-tree
      v-if="tree.length > 0"
      :data="tree"
      node-key="id"
      default-expand-all
      :expand-on-click-node="false"
      class="layer-tree"
    >
      <template #default="{ data }">
        <div class="tree-node">
          <div class="tree-main">
            <span class="tree-name">{{ data.name }}</span>
            <span class="tree-kind">{{ kindLabel[data.kind as LayerKind] }}</span>
            <span v-if="data.kind === 'entities'" class="tree-count">
              {{ data.entityCount ?? 0 }}
            </span>
          </div>
          <div class="tree-actions">
            <el-switch
              :model-value="data.visible"
              size="small"
              @click.stop
              @update:model-value="onVisible(data as LayerNode, Boolean($event))"
            />
            <el-button size="small" text title="上移" @click.stop="moveBy(data as LayerNode, -1)">
              ↑
            </el-button>
            <el-button size="small" text title="下移" @click.stop="moveBy(data as LayerNode, 1)">
              ↓
            </el-button>
            <el-button size="small" text title="删除" @click.stop="onRemove(data as LayerNode)">
              ×
            </el-button>
          </div>
        </div>
        <div v-if="data.kind === 'imagery'" class="alpha-row" @click.stop>
          <el-slider
            :model-value="Math.round((data.alpha ?? 1) * 100)"
            :min="0"
            :max="100"
            size="small"
            @update:model-value="onAlpha(data as LayerNode, $event)"
          />
        </div>
      </template>
    </el-tree>

    <p v-else class="hint">打开“图层”面板中的示例后，这里会显示图层树。</p>

    <p v-if="tree.length > 0" class="hint">
      同级顺序表示叠加顺序，分组显隐会级联到子图层；实体组只保证组级顺序。
    </p>
  </el-card>
</template>

<style scoped>
.layer-tree {
  background: transparent;
  color: #e5e7eb;
}

.layer-tree :deep(.el-tree-node__content) {
  height: auto;
  min-height: 28px;
  background: transparent;
}

.layer-tree :deep(.el-tree-node__expand-icon) {
  color: #9ca3af;
}

.tree-node {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 2px 0;
}

.tree-main {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.tree-name {
  overflow: hidden;
  color: #e5e7eb;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-kind {
  flex: none;
  padding: 0 4px;
  border-radius: 3px;
  background: rgba(103, 194, 58, 0.12);
  color: #67c23a;
  font-size: 10px;
}

.tree-count {
  color: #9ca3af;
  font-size: 11px;
}

.tree-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: none;
}

.tree-actions :deep(.el-button) {
  margin-left: 0;
  padding: 2px 4px;
  color: #9ca3af;
}

.alpha-row {
  width: 100%;
  padding: 0 24px 2px 0;
}

.alpha-row :deep(.el-slider) {
  --el-slider-height: 3px;
}

.hint {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #9ca3af;
}
</style>
