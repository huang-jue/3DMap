import type { CesiumFeature, FeatureContext, PopupHandle } from '@sgyx/cesium-kit-core'
import { loadWeatherWarnings } from '../data/loadWeather'
import {
  WeatherWarningLayer,
  warningCenter,
  type WeatherWarningLayerOptions
} from '../layers/WeatherWarningLayer'
import { ensureWeatherLayerGroup } from '../shared/layerTree'
import type { WeatherWarning } from '../shared/types'

export interface WeatherWarningFeatureOptions extends WeatherWarningLayerOptions {
  /** 预警数组或 GeoJSON URL/JSON 字符串 */
  warnings: WeatherWarning[] | string
  name?: string
  showPopup?: boolean
  /** Optional fixed time for explicitly labelled offline demonstration data. */
  time?: Date
  onSelect?: (warning: WeatherWarning | null) => void
}

export interface WeatherWarningFeature extends CesiumFeature<WeatherWarningFeatureOptions> {
  readonly layer: WeatherWarningLayer | null
  readonly warnings: WeatherWarning[]
  select(id: string | null): void
  setVisible(visible: boolean): void
  setTime(time: Date | null): void
}

function formatTime(time: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())} ${pad(time.getHours())}:${pad(time.getMinutes())}`
}

function createPopupContent(warning: WeatherWarning): HTMLElement {
  const container = document.createElement('div')
  const rows: Array<[string, string]> = [
    ['类型', warning.type],
    ['等级', warning.level],
    ['生效', formatTime(warning.startTime)],
    ['结束', formatTime(warning.endTime)]
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
  if (warning.description) {
    const description = document.createElement('div')
    description.style.marginTop = '6px'
    description.style.fontSize = '12px'
    description.style.lineHeight = '1.5'
    description.textContent = warning.description
    container.appendChild(description)
  }
  return container
}

/** 气象预警插件：预警区域按时效自动显隐，点击查看详情。 */
export function createWeatherWarningFeature(
  defaultOptions: WeatherWarningFeatureOptions
): WeatherWarningFeature {
  let layer: WeatherWarningLayer | null = null
  let warnings: WeatherWarning[] = []
  let selected: WeatherWarning | null = null
  let popup: PopupHandle | null = null
  let ctxRef: FeatureContext | null = null
  let unsubscribeTick: (() => void) | undefined
  let nodeId: string | undefined
  let visibleState = defaultOptions.visible ?? true
  let showPopup = defaultOptions.showPopup ?? true
  let onSelect = defaultOptions.onSelect
  let disposed = false
  let fixedTime = defaultOptions.time

  const closePopup = (): void => {
    popup?.close()
    popup = null
  }

  const refreshPopup = (): void => {
    if (!popup || !selected) return
    popup.setContent(createPopupContent(selected))
  }

  const selectWarning = (warning: WeatherWarning | null): void => {
    selected = warning
    if (!warning) {
      closePopup()
      onSelect?.(null)
      return
    }
    if (ctxRef && showPopup) {
      const center = warningCenter(warning)
      popup = ctxRef.popup.open({
        id: 'weather-warning-popup',
        position: { lon: center.lon, lat: center.lat, height: 0 },
        title: warning.title,
        content: createPopupContent(warning)
      })
    }
    onSelect?.(warning)
  }

  const install = async (
    ctx: FeatureContext,
    options?: WeatherWarningFeatureOptions
  ): Promise<void> => {
    disposed = false
    ctxRef = ctx
    const merged: WeatherWarningFeatureOptions = { ...defaultOptions, ...options }
    showPopup = merged.showPopup ?? true
    fixedTime = merged.time
    onSelect = merged.onSelect
    warnings = await loadWeatherWarnings(merged.warnings)
    if (disposed) return
    visibleState = merged.visible ?? true
    layer = new WeatherWarningLayer(ctx.viewer, warnings, {
      ...merged,
      visible: visibleState,
      onSelect: selectWarning,
      addEntity: (entity) => ctx.layers.add(entity)
    })
    layer.setTime(fixedTime ?? ctx.clock.state.currentTime)
    if (ctx.layerManager) {
      nodeId = ctx.layerManager.addCustom('气象预警', {
        id: 'weather-layer:warnings',
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
    const offMiss = ctx.pick.onMiss(() => selectWarning(null))
    unsubscribeTick = ctx.clock.onTick(({ currentTime }) => {
      layer?.setTime(fixedTime ?? currentTime)
      refreshPopup()
    })
    ctx.layers.onDispose(() => {
      offPick()
      offMiss()
      unsubscribeTick?.()
      closePopup()
      layer?.destroy()
    })
    ctx.log.info(`气象预警已加载：${warnings.length} 条`)
  }

  const feature: WeatherWarningFeature = {
    name: defaultOptions.name ?? 'weather-warnings',
    get layer() {
      return layer
    },
    get warnings() {
      return warnings
    },
    install,
    select(id: string | null) {
      const warning = id ? warnings.find((item) => item.id === id) : undefined
      selectWarning(warning ?? null)
    },
    setVisible(visible: boolean) {
      if (!visible) selectWarning(null)
      visibleState = visible
      layer?.setVisible(visible)
      if (nodeId) ctxRef?.layerManager?.setVisible(nodeId, visible)
    },
    setTime(time: Date | null) {
      layer?.setTime(time)
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
      warnings = []
      selected = null
      ctxRef = null
    }
  }

  return feature
}
