<script setup lang="ts">
import { ref } from 'vue'
import { Files } from '@element-plus/icons-vue'
import { useLayerManager } from '@sgyx/cesium-kit-vue'
import { ElMessage } from 'element-plus'

const { tree, createGroup, addDataSource, addTileset, remove } = useLayerManager()

const geoJsonEnabled = ref(false)
const tilesetEnabled = ref(false)
const loading = ref('')

async function ensureGroup(name: string): Promise<string> {
  const existing = tree.value.find((node) => node.kind === 'group' && node.name === name)
  if (existing) return existing.id
  const group = await createGroup(name)
  if (!group) throw new Error(`图层组创建失败：${name}`)
  return group.id
}

async function toggleGeoJson(enabled: boolean) {
  geoJsonEnabled.value = enabled
  loading.value = enabled ? 'geojson' : ''
  try {
    if (enabled) {
      await addDataSource(
        'demo-geojson',
        { type: 'geojson', data: '/data/demo.geojson' },
        {
          parentId: await ensureGroup('示例图层'),
          style: {
            pointColor: '#67c23a',
            pointSize: 9,
            lineColor: '#409eff',
            lineWidth: 3,
            polygonColor: 'rgba(64, 158, 255, 0.25)',
            polygonOutlineColor: '#409eff',
            labelColor: '#ffffff',
            clampToGround: true
          }
        }
      )
    } else if (tree.value.some((node) => node.children.some((child) => child.id === 'demo-geojson'))) {
      await remove('demo-geojson')
    }
  } catch (error) {
    geoJsonEnabled.value = false
    ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally {
    loading.value = ''
  }
}

async function toggleTileset(enabled: boolean) {
  tilesetEnabled.value = enabled
  loading.value = enabled ? 'tileset' : ''
  try {
    if (enabled) {
      await addTileset(
        'demo-tileset',
        '/tiles/demo/tileset.json',
        {
          parentId: await ensureGroup('示例图层'),
          maximumScreenSpaceError: 4,
          style: { color: 'color("#67c23a", 0.9)' }
        }
      )
    } else if (tree.value.some((node) => node.children.some((child) => child.id === 'demo-tileset'))) {
      await remove('demo-tileset')
    }
  } catch (error) {
    tilesetEnabled.value = false
    ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally {
    loading.value = ''
  }
}
</script>

<template>
  <el-card class="cesium-panel" shadow="always" :body-style="{ padding: '16px' }">
    <template #header>
      <div class="panel-title">
        <el-icon><Files /></el-icon>
        <span>图层</span>
      </div>
    </template>

    <div class="row">
      <el-switch
        :model-value="geoJsonEnabled"
        size="small"
        :loading="loading === 'geojson'"
        active-text="GeoJSON 示例"
        inline-prompt
        @update:model-value="toggleGeoJson(Boolean($event))"
      />
    </div>

    <div class="row">
      <el-switch
        :model-value="tilesetEnabled"
        size="small"
        :loading="loading === 'tileset'"
        active-text="3D Tiles 示例"
        inline-prompt
        @update:model-value="toggleTileset(Boolean($event))"
      />
    </div>

    <p class="hint">GeoJSON 为长江流域示例；3D Tiles 为仓库内离线小样例。加载后可在“图层树”中调整显隐与顺序。</p>
  </el-card>
</template>

<style scoped>
.row {
  margin-bottom: 12px;
}

.hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #9ca3af;
}
</style>
