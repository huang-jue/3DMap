<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import * as echarts from 'echarts'
import { pointSeriesCsv, type EarthPlugin, type EarthPointSeries } from '@sgyx/cesium-kit-earth'
import { saveFile, formatEarthTime } from './earthUtils'
const props = defineProps<{
  plugin: EarthPlugin
  point: { lon: number; lat: number } | null
  selection: string
}>()
const data = shallowRef<EarthPointSeries | null>(null)
const busy = ref(false)
const error = ref('')
const chartHosts = ref<HTMLElement[]>([])
let charts: echarts.ECharts[] = []
let observer: ResizeObserver | undefined
let request: AbortController | undefined
function clearCharts() {
  observer?.disconnect()
  charts.forEach((chart) => chart.dispose())
  charts = []
}
async function load() {
  request?.abort()
  clearCharts()
  data.value = null
  error.value = ''
  if (!props.point) return
  const current = new AbortController()
  request = current
  busy.value = true
  try {
    const result = await props.plugin.getPointSeries(props.point.lon, props.point.lat, {
      signal: current.signal
    })
    if (current.signal.aborted) return
    data.value = result
    await nextTick()
    observer = new ResizeObserver(() => charts.forEach((chart) => chart.resize()))
    result.series.forEach((series, index) => {
      const host = chartHosts.value[index]
      if (!host) return
      const chart = echarts.init(host, 'dark')
      charts.push(chart)
      observer!.observe(host)
      chart.setOption({
        backgroundColor: 'transparent',
        animation: false,
        title: { text: `${series.label} (${series.unit})`, textStyle: { fontSize: 12 } },
        tooltip: { trigger: 'axis' },
        grid: { left: 55, right: 12, top: 38, bottom: 55 },
        xAxis: {
          type: 'category',
          data: series.points.map((point) => formatEarthTime(new Date(point.time))),
          axisLabel: { fontSize: 9, rotate: 25 }
        },
        yAxis: {
          type: 'value',
          axisLabel: {
            fontSize: 10,
            formatter: (value: number) => series.categories?.[value] ?? String(value)
          }
        },
        series: [
          {
            type: 'line',
            step: series.categories ? 'end' : false,
            connectNulls: false,
            data: series.points.map((point) => point.value),
            symbolSize: 5,
            lineStyle: { color: '#77d6b7' },
            itemStyle: { color: '#77d6b7' }
          }
        ]
      })
    })
  } catch (cause) {
    if (!current.signal.aborted) error.value = String(cause)
  } finally {
    if (request === current) busy.value = false
  }
}
watch(
  () => [props.plugin, props.point?.lon, props.point?.lat, props.selection],
  () => void load(),
  { immediate: true }
)
onBeforeUnmount(() => {
  request?.abort()
  clearCharts()
})
</script>
<template>
  <section class="earth-analysis" aria-label="点位时间分析">
    <p v-if="!point">先点击地图固定一个点位，再查看时间曲线。</p>
    <template v-else>
      <p>{{ point.lon.toFixed(3) }}°, {{ point.lat.toFixed(3) }}° · UTC+8</p>
      <p v-if="busy" role="status">正在采样时间序列…</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <el-button v-if="error" size="small" @click="load">重试分析</el-button>
      <el-button
        :disabled="!data || busy"
        size="small"
        @click="
          data && saveFile('point-series.csv', pointSeriesCsv(data), 'text/csv;charset=utf-8')
        "
      >
        导出 CSV
      </el-button
      >
      <p v-if="data && !data.series.length">当前未选择标量或矢量变量。</p>
      <div
        v-for="series in data?.series ?? []"
        :key="series.id"
        ref="chartHosts"
        class="series-chart"
        :aria-label="`${series.label}时间曲线`"
      />
    </template>
  </section>
</template>
<style scoped>
.earth-analysis {
  color: #cbd5e1;
  font-size: 12px;
}
.series-chart {
  width: 100%;
  height: 220px;
  margin-top: 14px;
}
</style>
