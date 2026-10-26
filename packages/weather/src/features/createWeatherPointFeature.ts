import type { CesiumFeature, FeatureContext, PopupHandle } from '@sgyx/cesium-kit-core'
import { loadWeatherPoints } from '../data/loadWeather'
import { WeatherPointLayer, type WeatherPointLayerOptions } from '../layers/WeatherPointLayer'
import { ensureWeatherLayerGroup } from '../shared/layerTree'
import type { WeatherHourlyForecast, WeatherPointForecast } from '../shared/types'

export interface WeatherPointFeatureOptions extends WeatherPointLayerOptions {
  /** 点预报数组、JSON 字符串或 URL */
  points: WeatherPointForecast[] | string
  name?: string
  /** 点击后是否显示内置弹窗，默认 true */
  showPopup?: boolean
  onSelect?: (point: WeatherPointForecast | null) => void
}

export interface WeatherPointFeature extends CesiumFeature<WeatherPointFeatureOptions> {
  readonly layer: WeatherPointLayer | null
  readonly points: WeatherPointForecast[]
  select(id: string | null): void
  setVisible(visible: boolean): void
}

function nearestHourly(hourly: WeatherHourlyForecast[], time: Date): WeatherHourlyForecast | null {
  if (hourly.length === 0) return null
  let best = hourly[0]!
  let distance = Math.abs(best.time.getTime() - time.getTime())
  for (let i = 1; i < hourly.length; i += 1) {
    const item = hourly[i]!
    const next = Math.abs(item.time.getTime() - time.getTime())
    if (next < distance) {
      best = item
      distance = next
    }
  }
  return best
}

function formatTime(time: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())} ${pad(time.getHours())}:${pad(time.getMinutes())}`
}

function formatValue(value: number | undefined, unit: string, digits = 1): string {
  if (value === undefined) return '-'
  return `${value.toFixed(digits).replace(/\.0$/, '')} ${unit}`
}

function createPopupContent(point: WeatherPointForecast, time: Date): HTMLElement {
  const container = document.createElement('div')
  const hourly = nearestHourly(point.hourly, time)
  if (!hourly) {
    container.textContent = '暂无点预报数据'
    return container
  }

  const title = document.createElement('div')
  title.style.fontWeight = '600'
  title.style.marginBottom = '4px'
  title.textContent = formatTime(hourly.time)
  container.appendChild(title)

  const rows: Array<[string, string]> = [
    ['天气', hourly.text ?? hourly.weatherCode ?? '-'],
    ['温度', formatValue(hourly.temperature, '°C')],
    ['降水', formatValue(hourly.precipitation, 'mm/h')],
    ['湿度', formatValue(hourly.humidity, '%', 0)],
    ['风速', formatValue(hourly.windSpeed, 'm/s')],
    ['风向', hourly.windDirection === undefined ? '-' : `${Math.round(hourly.windDirection)}°`]
  ]
  for (const [label, value] of rows) {
    const row = document.createElement('div')
    row.style.display = 'flex'
    row.style.justifyContent = 'space-between'
    row.style.gap = '16px'
    row.style.fontSize = '12px'
    row.style.lineHeight = '1.6'
    const key = document.createElement('span')
    key.style.color = '#9ca3af'
    key.textContent = label
    const text = document.createElement('span')
    text.textContent = value
    row.append(key, text)
    container.appendChild(row)
  }
  return container
}

/**
 * 城市/任意点预报插件。库内只提供轻量 DOM 弹窗，宿主可通过 onSelect 接管 UI。
 */
export function createWeatherPointFeature(
  defaultOptions: WeatherPointFeatureOptions
): WeatherPointFeature {
  let layer: WeatherPointLayer | null = null
  let points: WeatherPointForecast[] = []
  let selected: WeatherPointForecast | null = null
  let popup: PopupHandle | null = null
  let ctxRef: FeatureContext | null = null
  let unsubscribeTick: (() => void) | undefined
  let nodeId: string | undefined
  let visibleState = defaultOptions.visible ?? true
  let showPopup = defaultOptions.showPopup ?? true
  let onSelect = defaultOptions.onSelect
  let disposed = false

  const closePopup = (): void => {
    popup?.close()
    popup = null
  }

  const refreshPopup = (): void => {
    if (!ctxRef || !popup || !selected) return
    popup.setContent(createPopupContent(selected, ctxRef.clock.state.currentTime))
  }

  const selectPoint = (point: WeatherPointForecast | null): void => {
    selected = point
    if (!point) {
      closePopup()
      onSelect?.(null)
      return
    }
    if (ctxRef && showPopup) {
      popup = ctxRef.popup.open({
        id: 'weather-point-popup',
        position: { lon: point.lon, lat: point.lat, height: 0 },
        title: point.name ?? '点预报',
        content: createPopupContent(point, ctxRef.clock.state.currentTime)
      })
    }
    onSelect?.(point)
  }

  const install = async (
    ctx: FeatureContext,
    options?: WeatherPointFeatureOptions
  ): Promise<void> => {
    disposed = false
    ctxRef = ctx
    const merged: WeatherPointFeatureOptions = { ...defaultOptions, ...options }
    showPopup = merged.showPopup ?? true
    onSelect = merged.onSelect
    points = await loadWeatherPoints(merged.points)
    if (disposed) return
    visibleState = merged.visible ?? true
    layer = new WeatherPointLayer(ctx.viewer, points, {
      ...merged,
      visible: visibleState,
      onSelect: selectPoint,
      addEntity: (entity) => ctx.layers.add(entity)
    })
    if (ctx.layerManager) {
      nodeId = ctx.layerManager.addCustom('城市预报', {
        id: 'weather-layer:points',
        parentId: ensureWeatherLayerGroup(ctx),
        visible: visibleState,
        handle: {
          setVisible: (visible) => {
            visibleState = visible
            layer?.setVisible(visible)
          },
          destroy: () => {
            layer?.destroy()
            layer = null
          }
        }
      }).id
    }
    const offPick = ctx.pick.on('click', ({ entity }) => layer?.handlePick(entity))
    const offMiss = ctx.pick.onMiss(() => layer?.clearSelection())
    unsubscribeTick = ctx.clock.onTick(() => refreshPopup())
    ctx.layers.onDispose(() => {
      offPick()
      offMiss()
      unsubscribeTick?.()
      closePopup()
      layer?.destroy()
    })
    ctx.log.info(`点预报已加载：${points.length} 个点`)
  }

  const feature: WeatherPointFeature = {
    name: defaultOptions.name ?? 'weather-points',
    get layer() {
      return layer
    },
    get points() {
      return points
    },
    install,
    select(id: string | null) {
      layer?.select(id)
    },
    setVisible(visible: boolean) {
      visibleState = visible
      layer?.setVisible(visible)
      if (nodeId) ctxRef?.layerManager?.setVisible(nodeId, visible)
    },
    dispose() {
      disposed = true
      unsubscribeTick?.()
      unsubscribeTick = undefined
      if (nodeId && ctxRef?.layerManager?.get(nodeId)) {
        ctxRef.layerManager.remove(nodeId, { removeSource: false })
      }
      nodeId = undefined
      closePopup()
      layer?.destroy()
      layer = null
      points = []
      selected = null
      ctxRef = null
    }
  }

  return feature
}
