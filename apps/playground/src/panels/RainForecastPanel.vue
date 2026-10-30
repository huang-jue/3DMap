<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import * as echarts from 'echarts'
import { getRainForecast, summarizeRainForecast, type RainForecast } from '@sgyx/cesium-kit-weather'
import { demoRainProvider } from './rainDemo'
import { formatEarthTime } from './earthUtils'

const props = defineProps<{
  point: { lon: number; lat: number } | null
  mode: 'online' | 'demo'
  earthMode: boolean
  fresh?: boolean
}>()
const emit = defineEmits<{
  close: []
  select: []
  'update:mode': [mode: 'online' | 'demo']
  analysis: []
}>()
const data = shallowRef<RainForecast | null>(null)
const busy = ref(false)
const error = ref('')
const rainHost = ref<HTMLElement | null>(null)
const probabilityHost = ref<HTMLElement | null>(null)
const summary = computed(() => (data.value ? summarizeRainForecast(data.value) : null))
let request: AbortController | undefined
let charts: echarts.ECharts[] = []
let observer: ResizeObserver | undefined

function clearCharts() {
  observer?.disconnect()
  charts.forEach((chart) => chart.dispose())
  charts = []
}
async function load(forceRefresh = false) {
  request?.abort()
  clearCharts()
  data.value = null
  error.value = ''
  busy.value = false
  if (!props.point) return
  const current = new AbortController()
  request = current
  busy.value = true
  try {
    const result = await getRainForecast(props.point.lon, props.point.lat, {
      signal: current.signal,
      forceRefresh,
      provider: props.mode === 'demo' ? demoRainProvider : undefined
    })
    if (current.signal.aborted) return
    data.value = result
    await nextTick()
    if (current.signal.aborted) return
    drawCharts(result)
  } catch (cause) {
    if (!current.signal.aborted)
      error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    if (request === current) busy.value = false
  }
}
function drawCharts(forecast: RainForecast) {
  observer = new ResizeObserver(() => charts.forEach((chart) => chart.resize()))
  const labels = forecast.hourly.map((hour) => formatEarthTime(new Date(hour.end)))
  for (const [host, kind, label, unit] of [
    [rainHost.value, 'rain', '小时雨量', 'mm'],
    [probabilityHost.value, 'probability', '降雨概率', '%']
  ] as const) {
    if (!host) continue
    const chart = echarts.init(host, 'dark')
    charts.push(chart)
    observer.observe(host)
    chart.setOption({
      backgroundColor: 'transparent',
      animation: false,
      title: { text: `${label} (${unit})`, textStyle: { fontSize: 12 } },
      tooltip: {
        trigger: 'axis',
        confine: true,
        valueFormatter: (value: unknown) =>
          value === null || value === undefined ? '缺测' : `${value} ${unit}`
      },
      grid: { left: 42, right: 14, top: 40, bottom: 50 },
      xAxis: {
        type: 'category',
        data: labels,
        axisLabel: { fontSize: 10, formatter: (text: string) => text.slice(5).replace(' ', '\n') }
      },
      yAxis: { type: 'value', min: 0, ...(kind === 'probability' ? { max: 100 } : {}) },
      series: [
        {
          type: kind === 'rain' ? 'bar' : 'line',
          data: forecast.hourly.map((hour) => hour[kind]),
          connectNulls: false,
          itemStyle: { color: kind === 'rain' ? '#58b9ee' : '#77d6b7' },
          symbolSize: 4
        }
      ]
    })
  }
}
let firstLoad = true
watch(
  () => [props.point?.lon, props.point?.lat, props.mode],
  () => {
    void load(firstLoad && props.fresh)
    firstLoad = false
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  request?.abort()
  clearCharts()
})
</script>

<template>
  <section class="rain-panel" aria-label="降雨预报" tabindex="-1">
    <div class="rain-heading">
      <h2>降雨预报</h2>
      <button type="button" aria-label="关闭降雨预报" @click="emit('close')">×</button>
    </div>
    <div class="rain-actions">
      <label
      >数据
        <select
          :value="mode"
          aria-label="降雨预报数据模式"
          @change="
            emit('update:mode', ($event.target as HTMLSelectElement).value as 'online' | 'demo')
          "
        >
          <option value="online">在线预报</option>
          <option value="demo">离线演示</option>
        </select>
      </label>
      <button type="button" :disabled="!point || busy" @click="load(true)">刷新预报</button>
      <button type="button" @click="emit('select')">重新选点</button>
      <button v-if="earthMode && point" type="button" @click="emit('analysis')">变量分析</button>
    </div>
    <p v-if="point" class="rain-coordinate">
      {{ point.lon.toFixed(5) }}°, {{ point.lat.toFixed(5) }}°
    </p>
    <p v-else role="status">请点击地图固定一个位置，再查看降雨预报。</p>
    <p class="rain-note">UTC+8 · 小时级预报；雨量表示该时刻结束的前一小时累计。</p>
    <p class="rain-note">在线预报按当前真实时间查询；地图时间轴和离线降水快照独立。</p>
    <p class="rain-note">概率为服务提供的降水概率（含雨雪），不由雨量推算。</p>
    <p v-if="mode === 'demo'" class="rain-demo-note">
      离线演示 · 固定样例曲线，不代表所选位置的实际天气。
    </p>
    <p v-if="busy" role="status">正在获取降雨预报…</p>
    <div v-if="error" class="rain-error" role="alert">
      <p>{{ error }}</p>
      <button type="button" @click="load(true)">重试预报</button>
      <button v-if="mode === 'online'" type="button" @click="emit('update:mode', 'demo')">
        查看离线演示
      </button>
    </div>
    <template v-if="data">
      <dl class="rain-metadata">
        <div>
          <dt>来源</dt>
          <dd>{{ data.mode === 'online' ? '在线预报' : '离线演示' }} · {{ data.source }}</dd>
        </div>
        <div>
          <dt>获取时间</dt>
          <dd>{{ formatEarthTime(new Date(data.fetchedAt)) }} UTC+8</dd>
        </div>
        <div>
          <dt>有效范围</dt>
          <dd>
            {{
              data.range
                ? `${formatEarthTime(new Date(data.range.start))} — ${formatEarthTime(new Date(data.range.end))}`
                : '无可用预报时段'
            }}
            UTC+8
          </dd>
        </div>
      </dl>
      <p v-if="!data.hourly.length" role="status">服务未提供未来可用时段，请刷新或稍后重试。</p>
      <template v-else-if="summary">
        <p class="rain-total" role="status">
          {{ summary.complete ? '48 小时累计雨量' : '已知时段累计雨量' }}：{{
            summary.totalRain === null ? '缺测' : summary.totalRain.toFixed(1) + ' mm'
          }}
        </p>
        <p class="rain-note">
          可用 {{ data.hourly.length }} / 48 个时段，雨量有效
          {{ summary.knownHours }} 个；概率缺测不推算。
        </p>
        <details class="rain-periods" open>
          <summary>预计有雨时段（小时雨量 ≥0.1 mm）</summary>
          <p v-for="period in summary.wetPeriods" :key="period.start">
            {{ formatEarthTime(new Date(period.start)) }} —
            {{ formatEarthTime(new Date(period.end)) }}
          </p>
          <p v-if="!summary.wetPeriods.length">
            已知时段未检出有雨时段{{
              summary.knownHours < data.hourly.length ? '，部分数据缺测' : ''
            }}。
          </p>
        </details>
        <div ref="rainHost" class="rain-chart" role="img" aria-label="逐小时雨量柱状图" />
        <div ref="probabilityHost" class="rain-chart" role="img" aria-label="逐小时降雨概率曲线" />
        <details class="rain-hourly-details">
          <summary>逐小时明细（雨雪分列）</summary>
          <div class="rain-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>区间结束 UTC+8</th>
                  <th>雨量 mm</th>
                  <th>概率 %</th>
                  <th>降水量 mm（含雨雪）</th>
                  <th>降雪 cm</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="hour in data.hourly" :key="hour.end">
                  <td>{{ formatEarthTime(new Date(hour.end)) }}</td>
                  <td>{{ hour.rain === null ? '缺测' : hour.rain.toFixed(1) }}</td>
                  <td>{{ hour.probability ?? '缺测' }}</td>
                  <td>{{ hour.precipitation ?? '缺测' }}</td>
                  <td>{{ hour.snowfall ?? '缺测' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </template>
      <p v-if="data.mode === 'online'" class="rain-attribution">
        天气数据：<a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer"
        >Open-Meteo</a
        >
        ·
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          target="_blank"
          rel="noopener noreferrer"
        >CC BY 4.0</a
        >
      </p>
    </template>
  </section>
</template>

<style scoped>
.rain-panel {
  min-width: 0;
  padding: 16px;
  color: #e5edf6;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.rain-heading,
.rain-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.rain-heading {
  position: sticky;
  top: 0;
  z-index: 2;
  justify-content: space-between;
  margin: -16px -16px 0;
  padding: 12px 16px;
  background: #101a2b;
  border-bottom: 1px solid #ffffff18;
}
h2 {
  margin: 0;
  font-size: 16px;
}
.rain-actions {
  margin: 12px 0;
}
button,
select {
  max-width: 100%;
  border: 1px solid #ffffff30;
  border-radius: 5px;
  background: #1c293d;
  color: #e5edf6;
  padding: 6px 8px;
  font: inherit;
}
button {
  cursor: pointer;
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
button:focus-visible,
select:focus-visible,
summary:focus-visible,
a:focus-visible {
  outline: 2px solid #77d6b7;
  outline-offset: 2px;
}
select {
  margin-left: 6px;
  color-scheme: dark;
}
p {
  line-height: 1.65;
  margin: 8px 0;
}
.rain-note,
dt {
  color: #a5b5c8;
}
.rain-demo-note {
  color: #f3cb82;
}
.rain-error {
  border: 1px solid #d6828255;
  padding: 10px;
  border-radius: 6px;
  color: #ffc5c5;
}
.rain-error button + button {
  margin-left: 6px;
}
.rain-metadata {
  margin: 14px 0;
}
.rain-metadata div {
  display: grid;
  grid-template-columns: 62px minmax(0, 1fr);
  gap: 8px;
  padding: 5px 0;
}
dd {
  margin: 0;
}
.rain-total {
  color: #96deca;
  font-size: 14px;
}
.rain-periods {
  max-height: 135px;
  overflow: auto;
}
summary {
  cursor: pointer;
  padding: 6px 0;
}
.rain-chart {
  height: 210px;
  width: 100%;
  min-width: 0;
  margin-top: 14px;
}
.rain-table-scroll {
  overflow: auto;
  max-height: 280px;
}
table {
  border-collapse: collapse;
  width: 100%;
  font-size: 11px;
}
td,
th {
  padding: 6px;
  border: 1px solid #ffffff20;
  text-align: left;
}
a {
  color: #85cdeb;
}
</style>
