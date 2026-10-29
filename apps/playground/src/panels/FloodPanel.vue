<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'
import { DataLine, Warning } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts'
import { useClock, useViewer } from '@sgyx/cesium-kit-vue'
import {
  createFloodPlugin,
  parseFloodDataset,
  WARNING_LEVEL_TEXT,
  WARNING_TYPE_TEXT,
  type FloodDataset,
  type FloodPlugin,
  type FloodWarning,
  type ForecastNode,
  type GeneratedPlan,
  type KnowledgeEntry,
  type RehearsalMode
} from '@sgyx/cesium-kit-flood'

const { manager } = useViewer()
const { state } = useClock()

const enabled = ref(false)
const loading = ref(false)
const errorText = ref('')
const dataset = ref<FloodDataset | null>(null)
const plugin = shallowRef<FloodPlugin | null>(null)
const activeTab = ref('data')
const dataVisible = reactive({
  rivers: true,
  projects: true,
  stations: true,
  mirror: true,
  rainfall: false,
  warnings: true,
  rehearsal: true
})
const selectedNodeId = ref('')
const selectedWarningId = ref('')
const selectedScenarioId = ref('')
const rehearsalMode = ref<RehearsalMode>('raster')
const selectedDispatchProjectId = ref('')
const warningType = ref('')
const warningLevel = ref('')
const planKeyword = ref('')
const knowledgeResults = ref<KnowledgeEntry[]>([])
const generatedPlan = ref<GeneratedPlan | null>(null)

const forecastChartEl = ref<HTMLElement | null>(null)
const dispatchChartEl = ref<HTMLElement | null>(null)
const breachChartEl = ref<HTMLElement | null>(null)
let forecastChart: echarts.ECharts | null = null
let dispatchChart: echarts.ECharts | null = null
let breachChart: echarts.ECharts | null = null

const currentTime = computed(() => state.value?.currentTime ?? new Date())
const forecastNodes = computed(() => dataset.value?.forecastNodes ?? [])
const warnings = computed(() => dataset.value?.warnings ?? [])
const scenarios = computed(() => dataset.value?.rehearsals ?? [])
const selectedNode = computed(() =>
  forecastNodes.value.find((node) => node.id === selectedNodeId.value)
)
const selectedWarning = computed(() =>
  warnings.value.find((warning) => warning.id === selectedWarningId.value)
)
const selectedScenario = computed(() =>
  scenarios.value.find((scenario) => scenario.id === selectedScenarioId.value)
)
const currentForecastValue = computed(
  () => plugin.value?.forecast?.getCurrentValue(selectedNodeId.value) ?? null
)
const filteredWarnings = computed(() =>
  warnings.value.filter(
    (warning) =>
      (!warningType.value || warning.type === warningType.value) &&
      (!warningLevel.value || warning.level === warningLevel.value)
  )
)
const dispatchProjects = computed(() => selectedScenario.value?.dispatch?.projects ?? [])
const selectedDispatchProject = computed(() =>
  dispatchProjects.value.find((project) => project.id === selectedDispatchProjectId.value)
)
const currentTab = computed(() => activeTab.value)

function formatTime(value: Date | null | undefined): string {
  if (!value) return '-'
  const pad = (number: number): string => String(number).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}`
}

function formatValue(value: number | null, unit = 'm'): string {
  if (value === null) return '-'
  return `${value.toFixed(2)} ${unit}`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function loadDataset(): Promise<FloodDataset> {
  if (dataset.value) return dataset.value
  const response = await fetch('/data/flood/flood.json')
  if (!response.ok) {
    throw new Error(`四预样例加载失败 ${response.status} ${response.statusText}`)
  }
  const parsed = parseFloodDataset(await response.json())
  dataset.value = parsed
  return parsed
}

function initSelections(meta: FloodDataset): void {
  selectedNodeId.value = meta.forecastNodes[0]?.id ?? ''
  selectedWarningId.value = meta.warnings[0]?.id ?? ''
  selectedScenarioId.value = meta.rehearsals[0]?.id ?? ''
  selectedDispatchProjectId.value =
    meta.rehearsals.find((item) => item.type === 'dispatch')?.dispatch?.projects[0]?.id ?? ''
  knowledgeResults.value = meta.knowledge
  generatedPlan.value = null
}

async function enableFlood(): Promise<void> {
  const instance = manager.value
  if (!instance || loading.value) return
  loading.value = true
  errorText.value = ''
  let pending: FloodPlugin | null = null
  try {
    const meta = await loadDataset()
    initSelections(meta)
    const flood = createFloodPlugin({
      data: meta,
      digitalMirrorUrl: meta.digitalMirrorUrl,
      scenarioId: selectedScenarioId.value,
      visible: true,
      followClock: true,
      syncClockRange: true,
      showRainfall: false,
      showPopup: true,
      continueOnError: true,
      onForecastSelect: (node) => {
        if (node) selectedNodeId.value = node.id
      },
      onWarningSelect: (warning) => {
        if (warning) selectedWarningId.value = warning.id
      },
      onGenerate: (plan) => {
        generatedPlan.value = plan
      },
      onLayerError: (key, error) => {
        ElMessage.warning(`${key} 加载失败：${errorMessage(error)}`)
      }
    })
    pending = flood
    await instance.features.register(flood)
    plugin.value = flood
    enabled.value = true
    dataVisible.rainfall = false
    dataVisible.rehearsal = true
    dataVisible.warnings = true
    if (meta.bounds) {
      instance.camera.setView({
        lon: (meta.bounds.west + meta.bounds.east) / 2,
        lat: (meta.bounds.south + meta.bounds.north) / 2,
        height: 1_200_000
      })
    }
    await nextTick()
    renderCharts()
  } catch (error) {
    if (pending && manager.value?.features.has(pending.name)) {
      manager.value.features.unregister(pending.name)
    }
    errorText.value = errorMessage(error)
    enabled.value = false
    plugin.value = null
    ElMessage.error(errorText.value)
  } finally {
    loading.value = false
  }
}

function disableFlood(): void {
  const instance = manager.value
  const flood = plugin.value
  if (instance && flood) instance.features.unregister(flood.name)
  plugin.value = null
  enabled.value = false
  errorText.value = ''
  disposeCharts()
}

function onEnabled(value: boolean): void {
  if (value) void enableFlood()
  else disableFlood()
}

function onDataVisible(key: keyof typeof dataVisible, value: boolean): void {
  dataVisible[key] = value
  const flood = plugin.value
  if (!flood) return
  if (key === 'rivers') flood.setRiversVisible(value)
  else if (key === 'projects') flood.setProjectsVisible(value)
  else if (key === 'stations') flood.setStationsVisible(value)
  else if (key === 'mirror') flood.setDigitalMirrorVisible(value)
  else if (key === 'rainfall') flood.setRainfallVisible(value)
  else if (key === 'warnings') flood.setWarningsVisible(value)
  else if (key === 'rehearsal') flood.setRehearsalVisible(value)
}

function focusForecast(node: ForecastNode): void {
  selectedNodeId.value = node.id
  plugin.value?.forecast?.select(node.id)
  manager.value?.camera.setView({ lon: node.lon, lat: node.lat, height: 300_000 })
}

function focusWarning(warning: FloodWarning): void {
  selectedWarningId.value = warning.id
  plugin.value?.warnings?.select(warning.id)
  const geometry = warning.geometry
  const ring =
    geometry?.type === 'Polygon' ? geometry.coordinates[0] : geometry?.coordinates[0]?.[0]
  const point = ring?.[0]
  const lon = warning.lon ?? point?.[0] ?? 0
  const lat = warning.lat ?? point?.[1] ?? 0
  manager.value?.camera.setView({ lon, lat, height: 500_000 })
}

function onScenarioChange(id: string): void {
  selectedScenarioId.value = id
  plugin.value?.setScenario(id)
  const scenario = scenarios.value.find((item) => item.id === id)
  selectedDispatchProjectId.value = scenario?.dispatch?.projects[0]?.id ?? ''
  if (scenario && manager.value) {
    manager.value.clock.setRange(scenario.startTime, scenario.endTime)
    manager.value.clock.seek(scenario.startTime)
  }
  void nextTick(renderCharts)
}

function onRehearsalMode(mode: RehearsalMode): void {
  rehearsalMode.value = mode
  plugin.value?.setRehearsalMode(mode)
}

function playRehearsal(): void {
  plugin.value?.play()
}

function pauseRehearsal(): void {
  plugin.value?.pause()
}

function searchKnowledge(): void {
  const flood = plugin.value
  knowledgeResults.value = flood?.searchKnowledge(planKeyword.value) ?? []
}

function generatePlan(): void {
  const flood = plugin.value
  if (!flood) return
  const plan = flood.generatePlan({
    warningIds: selectedWarningId.value ? [selectedWarningId.value] : undefined,
    forecastNodeId: selectedNodeId.value || undefined,
    scenarioId: selectedScenarioId.value || undefined
  })
  generatedPlan.value = plan
  if (!plan) ElMessage.warning('预案生成暂不可用')
}

function selectKnowledge(entry: KnowledgeEntry): void {
  planKeyword.value = entry.title
  knowledgeResults.value = [entry]
}

function chart(el: HTMLElement | null, instance: echarts.ECharts | null): echarts.ECharts | null {
  if (!el) return null
  let next = instance
  if (!next || next.isDisposed()) next = echarts.init(el)
  return next
}

function renderForecastChart(): void {
  if (currentTab.value !== 'forecast') return
  const node = selectedNode.value
  const instance = chart(forecastChartEl.value, forecastChart)
  if (!node || !instance) return
  forecastChart = instance
  chartObserver.observe(instance.getDom())
  const measured = node.series
    .filter((point) => !point.forecast)
    .map((point) => [point.time.getTime(), point.value])
  const forecast = node.series
    .filter((point) => point.forecast)
    .map((point) => [point.time.getTime(), point.value])
  if (measured.length > 0 && forecast.length > 0) {
    forecast.unshift(measured[measured.length - 1]!)
  }
  instance.setOption(
    {
      backgroundColor: 'transparent',
      grid: { left: 42, right: 16, top: 24, bottom: 36 },
      tooltip: { trigger: 'axis' },
      legend: { textStyle: { color: '#cbd5e1' } },
      xAxis: {
        type: 'time',
        axisLabel: { color: '#94a3b8', fontSize: 10 },
        axisLine: { lineStyle: { color: '#334155' } }
      },
      yAxis: {
        type: 'value',
        name: node.unit ?? 'm',
        axisLabel: { color: '#94a3b8', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } }
      },
      series: [
        {
          name: '实测',
          type: 'line',
          smooth: true,
          symbolSize: 4,
          data: measured,
          itemStyle: { color: '#38bdf8' },
          lineStyle: { color: '#38bdf8' }
        },
        {
          name: '预报',
          type: 'line',
          smooth: true,
          symbolSize: 4,
          data: forecast,
          itemStyle: { color: '#f97316' },
          lineStyle: { color: '#f97316', type: 'dashed' }
        }
      ]
    },
    true
  )
}

function renderDispatchChart(): void {
  if (currentTab.value !== 'rehearsal') return
  const project = selectedDispatchProject.value
  const instance = chart(dispatchChartEl.value, dispatchChart)
  if (!project?.series || !instance) return
  dispatchChart = instance
  chartObserver.observe(instance.getDom())
  instance.setOption(
    {
      backgroundColor: 'transparent',
      grid: { left: 46, right: 16, top: 24, bottom: 36 },
      tooltip: { trigger: 'axis' },
      legend: { textStyle: { color: '#cbd5e1' } },
      xAxis: {
        type: 'category',
        data: project.series.map((item) => formatTime(item.time).slice(5)),
        axisLabel: { color: '#94a3b8', fontSize: 10 },
        axisLine: { lineStyle: { color: '#334155' } }
      },
      yAxis: [
        {
          type: 'value',
          name: '流量',
          axisLabel: { color: '#94a3b8', fontSize: 10 },
          splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } }
        },
        {
          type: 'value',
          name: '水位',
          axisLabel: { color: '#94a3b8', fontSize: 10 }
        }
      ],
      series: [
        {
          name: '入库',
          type: 'line',
          smooth: true,
          data: project.series.map((item) => item.inflow),
          itemStyle: { color: '#38bdf8' }
        },
        {
          name: '出库',
          type: 'line',
          smooth: true,
          data: project.series.map((item) => item.outflow),
          itemStyle: { color: '#f97316' }
        },
        {
          name: '水位',
          type: 'line',
          smooth: true,
          yAxisIndex: 1,
          data: project.series.map((item) => item.level),
          itemStyle: { color: '#22c55e' }
        }
      ]
    },
    true
  )
}

function renderBreachChart(): void {
  if (currentTab.value !== 'rehearsal') return
  const breach = selectedScenario.value?.breach
  const instance = chart(breachChartEl.value, breachChart)
  if (!breach || !instance) return
  breachChart = instance
  chartObserver.observe(instance.getDom())
  instance.setOption(
    {
      backgroundColor: 'transparent',
      grid: { left: 46, right: 16, top: 24, bottom: 36 },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: breach.hydrograph.map((item) => formatTime(item.time).slice(5)),
        axisLabel: { color: '#94a3b8', fontSize: 10 }
      },
      yAxis: {
        type: 'value',
        name: 'm³/s',
        axisLabel: { color: '#94a3b8', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } }
      },
      series: [
        {
          name: '溃口流量',
          type: 'line',
          smooth: true,
          areaStyle: { color: 'rgba(239,68,68,0.18)' },
          data: breach.hydrograph.map((item) => item.flow),
          itemStyle: { color: '#ef4444' }
        }
      ]
    },
    true
  )
}

function renderCharts(): void {
  renderForecastChart()
  renderDispatchChart()
  renderBreachChart()
}

function resizeCharts(): void {
  forecastChart?.resize()
  dispatchChart?.resize()
  breachChart?.resize()
}

function disposeCharts(): void {
  forecastChart?.dispose()
  dispatchChart?.dispose()
  breachChart?.dispose()
  forecastChart = null
  dispatchChart = null
  breachChart = null
}

watch([activeTab, selectedNodeId, selectedScenarioId, selectedDispatchProjectId, enabled], () => {
  void nextTick(renderCharts)
})

const chartObserver = new ResizeObserver(resizeCharts)
watch(enabled, async () => {
  await nextTick()
  for (const host of [forecastChart?.getDom(), dispatchChart?.getDom(), breachChart?.getDom()])
    if (host) chartObserver.observe(host)
})
window.addEventListener('resize', resizeCharts)
onBeforeUnmount(() => {
  chartObserver.disconnect()
  window.removeEventListener('resize', resizeCharts)
  disposeCharts()
})

const warningTypeOptions = Object.entries(WARNING_TYPE_TEXT).map(([value, label]) => ({
  value,
  label
}))
const warningLevelOptions = Object.entries(WARNING_LEVEL_TEXT).map(([value, label]) => ({
  value,
  label
}))
</script>

<template>
  <el-card class="cesium-panel flood-panel" shadow="always" :body-style="{ padding: '16px' }">
    <template #header>
      <div class="panel-title">
        <el-icon><DataLine /></el-icon>
        <span>水旱灾害防御</span>
      </div>
    </template>

    <div class="row">
      <el-switch
        :model-value="enabled"
        size="small"
        :loading="loading"
        active-text="四预平台"
        inline-prompt
        @update:model-value="onEnabled(Boolean($event))"
      />
      <span class="meta mono">{{ dataset?.name ?? '静态样例' }}</span>
    </div>

    <p v-if="errorText" class="error">{{ errorText }}</p>

    <template v-if="enabled">
      <el-tabs v-model="activeTab" class="flood-tabs">
        <el-tab-pane label="底板" name="data">
          <div class="counts">
            <span>河流 {{ dataset?.rivers.length ?? 0 }}</span>
            <span>工程 {{ dataset?.waterProjects.length ?? 0 }}</span>
            <span>站点 {{ dataset?.stations.length ?? 0 }}</span>
          </div>
          <div class="switches">
            <el-switch
              :model-value="dataVisible.rivers"
              size="small"
              active-text="河流"
              inline-prompt
              @update:model-value="onDataVisible('rivers', Boolean($event))"
            />
            <el-switch
              :model-value="dataVisible.projects"
              size="small"
              active-text="工程"
              inline-prompt
              @update:model-value="onDataVisible('projects', Boolean($event))"
            />
            <el-switch
              :model-value="dataVisible.stations"
              size="small"
              active-text="站点"
              inline-prompt
              @update:model-value="onDataVisible('stations', Boolean($event))"
            />
            <el-switch
              :model-value="dataVisible.mirror"
              size="small"
              active-text="数字镜像"
              inline-prompt
              @update:model-value="onDataVisible('mirror', Boolean($event))"
            />
            <el-switch
              :model-value="dataVisible.warnings"
              size="small"
              active-text="风险预警"
              inline-prompt
              @update:model-value="onDataVisible('warnings', Boolean($event))"
            />
          </div>
          <p class="hint">点击河流、工程或站点查看属性；数字镜像复用仓库内 3D Tiles 样例。</p>
        </el-tab-pane>

        <el-tab-pane label="预报" name="forecast">
          <div class="field">
            <div class="field-label">预报节点</div>
            <el-select v-model="selectedNodeId" size="small" @change="renderForecastChart">
              <el-option
                v-for="node in forecastNodes"
                :key="node.id"
                :value="node.id"
                :label="node.name"
              />
            </el-select>
          </div>
          <div class="forecast-head">
            <div>
              <div class="value mono">{{ formatValue(currentForecastValue) }}</div>
              <div class="meta mono">{{ selectedNode?.name }} · {{ formatTime(currentTime) }}</div>
            </div>
            <el-button size="small" plain @click="selectedNode && focusForecast(selectedNode)">
              定位
            </el-button>
          </div>
          <div ref="forecastChartEl" class="chart" />
          <div class="row">
            <el-switch
              :model-value="dataVisible.rainfall"
              size="small"
              active-text="降雨落区"
              inline-prompt
              @update:model-value="onDataVisible('rainfall', Boolean($event))"
            />
          </div>
          <p class="hint">实线为实测，虚线为预报；点击地图上的预报节点可同步切换。</p>
        </el-tab-pane>

        <el-tab-pane label="预警" name="warning">
          <div class="filters">
            <el-select v-model="warningType" size="small" placeholder="风险类型" clearable>
              <el-option
                v-for="option in warningTypeOptions"
                :key="option.value"
                :value="option.value"
                :label="option.label"
              />
            </el-select>
            <el-select v-model="warningLevel" size="small" placeholder="等级" clearable>
              <el-option
                v-for="option in warningLevelOptions"
                :key="option.value"
                :value="option.value"
                :label="option.label"
              />
            </el-select>
          </div>
          <div class="warning-list">
            <div
              v-for="warning in filteredWarnings"
              :key="warning.id"
              class="warning-item"
              :class="{ active: warning.id === selectedWarningId }"
              @click="focusWarning(warning)"
            >
              <div class="warning-title">
                <el-icon><Warning /></el-icon>
                <span>{{ warning.title }}</span>
              </div>
              <div class="meta mono">
                {{ WARNING_TYPE_TEXT[warning.type] ?? warning.type }} ·
                {{ WARNING_LEVEL_TEXT[warning.level] ?? warning.level }} ·
                {{ warning.population ?? '-' }} 人
              </div>
            </div>
          </div>
          <div v-if="selectedWarning" class="warning-detail">
            <div class="warning-title">{{ selectedWarning.title }}</div>
            <p>{{ selectedWarning.description ?? '暂无描述' }}</p>
          </div>
        </el-tab-pane>

        <el-tab-pane label="预演" name="rehearsal">
          <div class="field">
            <div class="field-label">预演场景</div>
            <el-select v-model="selectedScenarioId" size="small" @change="onScenarioChange">
              <el-option
                v-for="scenario in scenarios"
                :key="scenario.id"
                :value="scenario.id"
                :label="scenario.name"
              />
            </el-select>
          </div>
          <div class="row">
            <el-radio-group
              :model-value="rehearsalMode"
              size="small"
              @update:model-value="onRehearsalMode($event as RehearsalMode)"
            >
              <el-radio-button value="raster">栅格</el-radio-button>
              <el-radio-button value="polygon">淹没面</el-radio-button>
            </el-radio-group>
            <el-button-group size="small">
              <el-button @click="playRehearsal">播放</el-button>
              <el-button @click="pauseRehearsal">暂停</el-button>
            </el-button-group>
          </div>
          <div class="meta mono">当前：{{ formatTime(currentTime) }}</div>
          <div class="row">
            <el-switch
              :model-value="dataVisible.rehearsal"
              size="small"
              active-text="显示预演"
              inline-prompt
              @update:model-value="onDataVisible('rehearsal', Boolean($event))"
            />
          </div>
          <div v-if="selectedScenario?.breach" class="field">
            <div class="field-label">溃口信息</div>
            <div class="meta mono">
              溃口宽度 {{ selectedScenario.breach.width }} m · 峰值
              {{ selectedScenario.breach.peakFlow }} m³/s
            </div>
            <div ref="breachChartEl" class="chart small" />
          </div>
          <div v-if="dispatchProjects.length > 0" class="field">
            <div class="field-label">联合调度</div>
            <el-select v-model="selectedDispatchProjectId" size="small">
              <el-option
                v-for="project in dispatchProjects"
                :key="project.id"
                :value="project.id"
                :label="project.name"
              />
            </el-select>
            <div ref="dispatchChartEl" class="chart small" />
            <div class="steps">
              <div v-for="step in selectedScenario?.dispatch?.steps ?? []" :key="step">
                · {{ step }}
              </div>
            </div>
          </div>
          <p class="hint">预演时间轴复用 ClockService，可在“时间轴”面板中播放、暂停和倍速。</p>
        </el-tab-pane>

        <el-tab-pane label="预案" name="plan">
          <div class="filters">
            <el-input v-model="planKeyword" size="small" placeholder="搜索知识库" />
            <el-button size="small" plain @click="searchKnowledge">搜索</el-button>
            <el-button size="small" type="primary" plain @click="generatePlan">生成预案</el-button>
          </div>
          <div class="knowledge-list">
            <div
              v-for="entry in knowledgeResults"
              :key="entry.id"
              class="knowledge-item"
              @click="selectKnowledge(entry)"
            >
              <div class="warning-title">{{ entry.title }}</div>
              <div class="meta mono">{{ entry.tags.join(' / ') }}</div>
            </div>
          </div>
          <div v-if="generatedPlan" class="plan-result">
            <div class="plan-title">{{ generatedPlan.title }}</div>
            <div class="meta mono">生成时间：{{ formatTime(generatedPlan.generatedAt) }}</div>
            <section v-for="section in generatedPlan.sections" :key="section.title">
              <h4>{{ section.title }}</h4>
              <p>{{ section.content }}</p>
            </section>
            <div v-if="generatedPlan.references.length > 0" class="references">
              <div class="field-label">知识引用</div>
              <div v-for="entry in generatedPlan.references" :key="entry.id" class="meta">
                · {{ entry.title }}
              </div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </template>

    <p v-else class="hint">静态样例覆盖数据底板、预报、预警、预演与预案五类功能。</p>
  </el-card>
</template>

<style scoped>
.flood-panel {
  width: 360px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.meta {
  color: #9ca3af;
}

.error {
  margin: 0 0 10px;
  color: #f56c6c;
  font-size: 12px;
  line-height: 1.5;
}

.flood-tabs :deep(.el-tabs__header) {
  margin-bottom: 10px;
}

.flood-tabs :deep(.el-tabs__item) {
  color: #9ca3af;
  font-size: 12px;
  padding: 0 8px;
}

.flood-tabs :deep(.el-tabs__item.is-active) {
  color: #67c23a;
}

.counts {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 11px;
  color: #cbd5e1;
}

.switches {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
}

.field :deep(.el-select),
.filters :deep(.el-input) {
  width: 100%;
}

.filters {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}

.filters :deep(.el-select) {
  width: 50%;
}

.forecast-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.value {
  color: #38bdf8;
  font-size: 18px;
  font-weight: 600;
}

.chart {
  width: 100%;
  height: 190px;
}

.chart.small {
  height: 150px;
  margin-top: 6px;
}

.warning-list,
.knowledge-list {
  max-height: 210px;
  overflow: auto;
  margin-bottom: 10px;
}

.warning-item,
.knowledge-item {
  padding: 8px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 6px;
  cursor: pointer;
}

.warning-item.active {
  border-color: #67c23a;
  background: rgba(103, 194, 58, 0.08);
}

.warning-title {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #e5e7eb;
  font-size: 12px;
  font-weight: 600;
}

.warning-detail {
  padding: 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  font-size: 12px;
  line-height: 1.6;
}

.warning-detail p {
  margin: 6px 0 0;
  color: #cbd5e1;
}

.steps {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.6;
  color: #9ca3af;
}

.plan-result {
  margin-top: 10px;
  padding: 10px;
  border-radius: 6px;
  background: rgba(103, 194, 58, 0.06);
  border: 1px solid rgba(103, 194, 58, 0.2);
}

.plan-title {
  color: #67c23a;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}

.plan-result h4 {
  margin: 10px 0 4px;
  font-size: 12px;
  color: #e5e7eb;
}

.plan-result p {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: #cbd5e1;
  white-space: pre-line;
}

.references {
  margin-top: 10px;
}

.hint {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #9ca3af;
}

@media (max-width: 720px) {
  .flood-panel {
    width: min(360px, calc(100vw - 32px));
  }
}
</style>
