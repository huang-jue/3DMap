<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useDraw, useSceneSnapshot } from '@sgyx/cesium-kit-vue'

const draw = useDraw()
const snapshots = useSceneSnapshot()
const busy = ref(false)
const report = ref('')
const drawingsInput = ref<HTMLInputElement | null>(null)
const sceneInput = ref<HTMLInputElement | null>(null)

async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  try {
    await action()
  } catch (error) {
    report.value = error instanceof Error ? error.message : String(error)
    ElMessage.error(report.value)
  } finally {
    busy.value = false
  }
}

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function exportDrawings() {
  const data = await draw.exportGeoJSON()
  if (data) {
    download('drawings.geojson', data)
    report.value = `已导出 ${data.features.length} 个成果`
  }
}

async function saveScene(local: boolean) {
  const result = local ? await snapshots.saveLocal() : await snapshots.capture()
  if (!local) download('scene.json', result.snapshot)
  report.value =
    `场景已保存；跳过 ${result.skipped.length} 项` +
    result.skipped.map((item) => `\n${item.id}：${item.reason}`).join('')
}

async function restoreScene(input?: string) {
  const result =
    input === undefined ? await snapshots.restoreLocal() : await snapshots.restore(input)
  report.value =
    `恢复完成：成功 ${result.succeeded.length}，失败 ${result.failed.length}，跳过 ${result.skipped.length}` +
    [...result.failed, ...result.skipped].map((item) => `\n${item.id}：${item.reason}`).join('')
}

async function importFile(event: Event, scene: boolean) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  await run(async () => {
    const text = await file.text()
    if (scene) await restoreScene(text)
    else {
      const sessions = await draw.importGeoJSON(text)
      report.value = `已导入 ${sessions.length} 个成果`
    }
  })
  input.value = ''
}
</script>

<template>
  <section class="cesium-panel persistence-panel">
    <h3>成果与场景</h3>
    <div class="persistence-actions">
      <el-button size="small" :disabled="busy" @click="run(exportDrawings)">导出成果</el-button>
      <el-button size="small" :disabled="busy" @click="drawingsInput?.click()">导入成果</el-button>
      <el-button size="small" :disabled="busy" @click="run(() => saveScene(false))">
        导出场景
      </el-button>
      <el-button size="small" :disabled="busy" @click="sceneInput?.click()">导入场景</el-button>
      <el-button size="small" :disabled="busy" @click="run(() => saveScene(true))">
        保存到本地
      </el-button>
      <el-button size="small" :disabled="busy" @click="run(() => restoreScene())">
        恢复本地场景
      </el-button>
    </div>
    <input
      ref="drawingsInput"
      aria-label="导入绘制文件"
      type="file"
      accept=".json,.geojson"
      hidden
      @change="importFile($event, false)"
    />
    <input
      ref="sceneInput"
      aria-label="导入场景文件"
      type="file"
      accept=".json"
      hidden
      @change="importFile($event, true)"
    />
    <p v-if="report" role="status">{{ report }}</p>
  </section>
</template>

<style scoped>
.persistence-panel {
  width: 300px;
  box-sizing: border-box;
  padding: 16px;
  border-radius: 4px;
}
h3 {
  margin: 0 0 12px;
  font-size: 14px;
}
.persistence-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.persistence-actions .el-button {
  margin: 0;
}
p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 12px;
  max-height: 150px;
  overflow: auto;
}
</style>
