import type { CesiumFeature, FeatureContext, PopupHandle } from '@sgyx/cesium-kit-core'
import { loadFloodDataset } from '../data/loadFloodData'
import { RiskWarningLayer } from '../layers/RiskWarningLayer'
import { ensureFloodLayerGroup } from '../shared/layerTree'
import { WARNING_LEVEL_TEXT, WARNING_TYPE_TEXT } from '../shared/palettes'
import type { FloodDataset, FloodWarning } from '../shared/types'

export interface FloodWarningFeatureOptions {
  data: FloodDataset | string
  name?: string
  visible?: boolean
  showPopup?: boolean
  onSelect?: (warning: FloodWarning | null) => void
}

export interface FloodWarningFeature extends CesiumFeature<FloodWarningFeatureOptions> {
  readonly data: FloodDataset | null
  readonly warnings: FloodWarning[]
  select(id: string | null): void
  setVisible(visible: boolean): void
  setTime(time: Date): void
}

function popupPosition(warning: FloodWarning): { lon: number; lat: number; height: number } {
  if (warning.lon !== undefined && warning.lat !== undefined) {
    return { lon: warning.lon, lat: warning.lat, height: 0 }
  }
  if (warning.geometry) {
    const ring =
      warning.geometry.type === 'Polygon'
        ? warning.geometry.coordinates[0]
        : warning.geometry.coordinates[0]?.[0]
    if (ring && ring.length > 0) {
      const total = ring.reduce(
        (acc, point) => ({ lon: acc.lon + (point[0] ?? 0), lat: acc.lat + (point[1] ?? 0) }),
        { lon: 0, lat: 0 }
      )
      return { lon: total.lon / ring.length, lat: total.lat / ring.length, height: 0 }
    }
  }
  return { lon: 0, lat: 0, height: 0 }
}

function content(warning: FloodWarning): string {
  return `<div style="font-size:12px;line-height:1.7">
    <div>类型：${WARNING_TYPE_TEXT[warning.type] ?? warning.type}</div>
    <div>等级：${WARNING_LEVEL_TEXT[warning.level] ?? warning.level}</div>
    <div>影响人口：${warning.population ?? '-'}</div>
    ${warning.description ? `<div style="margin-top:4px">${warning.description}</div>` : ''}
  </div>`
}

/** 风险预警：风险点/风险面、等级配色、时效过滤与弹窗。 */
export function createFloodWarningFeature(
  defaultOptions: FloodWarningFeatureOptions
): FloodWarningFeature {
  let data: FloodDataset | null = null
  let warnings: FloodWarning[] = []
  let layer: RiskWarningLayer | null = null
  let ctxRef: FeatureContext | null = null
  let unsubscribeTick: (() => void) | undefined
  let popup: PopupHandle | null = null
  let nodeId: string | undefined
  let visible = true
  let showPopup = defaultOptions.showPopup ?? true
  let onSelect = defaultOptions.onSelect
  let disposed = false

  const select = (warning: FloodWarning | null): void => {
    if (!ctxRef || !warning) {
      popup?.close()
      popup = null
      onSelect?.(null)
      return
    }
    if (showPopup) {
      popup = ctxRef.popup.open({
        id: 'flood-warning-popup',
        position: popupPosition(warning),
        title: warning.title,
        content: content(warning)
      })
    }
    onSelect?.(warning)
  }

  const install = async (
    ctx: FeatureContext,
    options?: FloodWarningFeatureOptions
  ): Promise<void> => {
    disposed = false
    ctxRef = ctx
    const merged = { ...defaultOptions, ...options }
    visible = merged.visible ?? true
    showPopup = merged.showPopup ?? true
    onSelect = merged.onSelect
    data = await loadFloodDataset(merged.data)
    if (disposed) return
    warnings = data.warnings
    layer = new RiskWarningLayer(ctx.viewer, warnings, {
      visible,
      onSelect: select,
      addEntity: (entity) => ctx.layers.add(entity)
    })
    layer.setTime(ctx.clock.state.currentTime)

    if (ctx.layerManager) {
      try {
        nodeId = ctx.layerManager.addCustom('气象风险预警', {
          id: 'flood-warnings',
          parentId: ensureFloodLayerGroup(ctx),
          visible,
          handle: {
            setVisible: (value) => {
              visible = value
              layer?.setVisible(value)
            },
            destroy: () => layer?.setVisible(false)
          }
        }).id
      } catch {
        // 忽略重复节点
      }
    }

    const offPick = ctx.pick.on('click', ({ entity }) => layer?.handlePick(entity))
    const offMiss = ctx.pick.onMiss(() => select(null))
    unsubscribeTick = ctx.clock.onTick(({ currentTime }) => {
      layer?.setTime(currentTime)
    })
    ctx.layers.onDispose(() => {
      offPick()
      offMiss()
      unsubscribeTick?.()
      popup?.close()
      layer?.destroy()
    })
    ctx.log.info(`风险预警已加载：${warnings.length} 条`)
  }

  const feature: FloodWarningFeature = {
    name: defaultOptions.name ?? 'flood-warnings',
    get data() {
      return data
    },
    get warnings() {
      return warnings
    },
    install,
    select(id) {
      const warning = id ? warnings.find((item) => item.id === id) : undefined
      select(warning ?? null)
    },
    setVisible(value) {
      visible = value
      layer?.setVisible(value)
      if (nodeId) ctxRef?.layerManager?.setVisible(nodeId, value)
    },
    setTime(time) {
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
      popup?.close()
      layer?.destroy()
      layer = null
      warnings = []
      data = null
      ctxRef = null
    }
  }

  return feature
}
