import * as Cesium from 'cesium'
import type { CesiumFeature, FeatureContext, PopupHandle } from '@sgyx/cesium-kit-core'
import { loadFloodDataset } from '../data/loadFloodData'
import { sampleSeries } from '../data/time'
import { RainfallVolumeLayer } from '../layers/RainfallVolumeLayer'
import { ensureFloodLayerGroup } from '../shared/layerTree'
import { toCesiumColor } from '../shared/color'
import { FORECAST_LEVEL_COLORS } from '../shared/palettes'
import type { FloodDataset, ForecastNode, ForecastPoint } from '../shared/types'

export interface FloodForecastFeatureOptions {
  data: FloodDataset | string
  name?: string
  visible?: boolean
  showRainfall?: boolean
  followClock?: boolean
  onSelect?: (node: ForecastNode | null) => void
}

export interface FloodForecastFeature extends CesiumFeature<FloodForecastFeatureOptions> {
  readonly data: FloodDataset | null
  readonly nodes: ForecastNode[]
  select(id: string | null): void
  setVisible(visible: boolean): void
  setRainfallVisible(visible: boolean): void
  setFollowClock(enabled: boolean): void
  getSeries(id: string): ForecastPoint[]
  getCurrentValue(id: string): number | null
}

function currentValue(node: ForecastNode, time: Date): number | null {
  return sampleSeries(node.series, time)
}

function formatValue(node: ForecastNode, value: number | null): string {
  if (value === null) return '-'
  return `${value.toFixed(1).replace(/\.0$/, '')} ${node.unit ?? 'm'}`
}

/** 洪水预报：预报节点、当前值、预报曲线与降雨落区三维演示。 */
export function createFloodForecastFeature(
  defaultOptions: FloodForecastFeatureOptions
): FloodForecastFeature {
  let data: FloodDataset | null = null
  let nodes: ForecastNode[] = []
  let entities: Cesium.Entity[] = []
  let entityMap = new Map<string, ForecastNode>()
  let rainfall: RainfallVolumeLayer | null = null
  let visible = true
  let followClock = true
  let ctxRef: FeatureContext | null = null
  let unsubscribeTick: (() => void) | undefined
  let popup: PopupHandle | null = null
  const nodeIds: string[] = []
  let disposed = false

  const nodeVisible = (): void => {
    entities.forEach((entity) => {
      entity.show = visible
    })
  }

  const select = (node: ForecastNode | null): void => {
    if (!ctxRef || !node) {
      popup?.close()
      popup = null
      defaultOptions.onSelect?.(null)
      return
    }
    const value = currentValue(node, ctxRef.clock.state.currentTime)
    popup = ctxRef.popup.open({
      id: 'flood-forecast-popup',
      position: { lon: node.lon, lat: node.lat, height: 0 },
      title: node.name,
      content: `<div style="font-size:12px;line-height:1.7">
        <div>当前预报：<strong>${formatValue(node, value)}</strong></div>
        <div>预警等级：${node.warningLevel ?? 'normal'}</div>
        <div>预报时段：${node.series.length} 个点</div>
      </div>`
    })
    defaultOptions.onSelect?.(node)
  }

  const updateRainfall = (): void => {
    if (!ctxRef) return
    rainfall?.setTime(ctxRef.clock.state.currentTime)
  }

  const install = async (
    ctx: FeatureContext,
    options?: FloodForecastFeatureOptions
  ): Promise<void> => {
    disposed = false
    ctxRef = ctx
    const merged = { ...defaultOptions, ...options }
    visible = merged.visible ?? true
    followClock = merged.followClock ?? true
    data = await loadFloodDataset(merged.data)
    if (disposed) return
    nodes = data.forecastNodes

    nodes.forEach((node) => {
      const color = toCesiumColor(FORECAST_LEVEL_COLORS[node.warningLevel ?? 'normal'] ?? '#67c23a')
      const entity = ctx.layers.add(
        new Cesium.Entity({
          id: `flood-forecast:${node.id}`,
          name: node.name,
          position: Cesium.Cartesian3.fromDegrees(node.lon, node.lat, 0),
          point: {
            pixelSize: 10,
            color,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          },
          label: {
            text: new Cesium.CallbackProperty(() => {
              const time = Cesium.JulianDate.toDate(ctx.viewer.clock.currentTime)
              return `${node.name} ${formatValue(node, currentValue(node, time))}`
            }, false),
            font: '12px sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -12),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        })
      )
      entities.push(entity)
      entityMap.set(entity.id, node)
    })

    if (data.rainfallFrames && data.rainfallFrames.length > 0 && merged.showRainfall) {
      rainfall = new RainfallVolumeLayer(ctx.viewer, data.rainfallFrames, {
        visible: false,
        addEntity: (entity) => ctx.layers.add(entity)
      })
      if (ctx.layerManager) {
        const id = 'flood-rainfall'
        try {
          ctx.layerManager.addCustom('降雨落区', {
            id,
            parentId: ensureFloodLayerGroup(ctx),
            visible: false,
            handle: {
              setVisible: (value) => {
                rainfall?.setVisible(value)
              },
              destroy: () => rainfall?.setVisible(false)
            }
          })
          nodeIds.push(id)
        } catch {
          // 忽略重复节点
        }
      }
    }

    const offPick = ctx.pick.on('click', ({ entity }) => {
      select(entity ? (entityMap.get(entity.id) ?? null) : null)
    })
    const offMiss = ctx.pick.onMiss(() => select(null))
    ctx.layers.onDispose(() => {
      offPick()
      offMiss()
      unsubscribeTick?.()
      popup?.close()
      rainfall?.destroy()
    })

    if (ctx.layerManager) {
      const id = 'flood-forecast-nodes'
      try {
        ctx.layerManager.addCustom('预报节点', {
          id,
          parentId: ensureFloodLayerGroup(ctx),
          handle: {
            setVisible: (value) => {
              visible = value
              nodeVisible()
            },
            destroy: () => {
              visible = false
              nodeVisible()
            }
          }
        })
        nodeIds.push(id)
      } catch {
        // 忽略重复节点
      }
    }

    if (followClock) {
      unsubscribeTick = ctx.clock.onTick(({ currentTime }) => {
        rainfall?.setTime(currentTime)
      })
    }
    if (!visible) nodeVisible()
    updateRainfall()
    ctx.log.info(`预报节点已加载：${nodes.length} 个`)
  }

  const feature: FloodForecastFeature = {
    name: defaultOptions.name ?? 'flood-forecast',
    get data() {
      return data
    },
    get nodes() {
      return nodes
    },
    install,
    select(id) {
      const node = id ? nodes.find((item) => item.id === id) : undefined
      select(node ?? null)
    },
    setVisible(value) {
      visible = value
      nodeVisible()
      if (ctxRef?.layerManager?.get('flood-forecast-nodes')) {
        ctxRef.layerManager.setVisible('flood-forecast-nodes', value)
      }
    },
    setRainfallVisible(value) {
      rainfall?.setVisible(value)
      if (ctxRef?.layerManager?.get('flood-rainfall')) {
        ctxRef.layerManager.setVisible('flood-rainfall', value)
      }
    },
    setFollowClock(enabled) {
      followClock = enabled
      unsubscribeTick?.()
      unsubscribeTick = undefined
      if (enabled && ctxRef) {
        unsubscribeTick = ctxRef.clock.onTick(({ currentTime }) => {
          rainfall?.setTime(currentTime)
        })
      }
    },
    getSeries(id) {
      return nodes.find((node) => node.id === id)?.series ?? []
    },
    getCurrentValue(id) {
      const node = nodes.find((item) => item.id === id)
      if (!node || !ctxRef) return null
      return currentValue(node, ctxRef.clock.state.currentTime)
    },
    dispose() {
      disposed = true
      unsubscribeTick?.()
      unsubscribeTick = undefined
      if (ctxRef?.layerManager) {
        nodeIds.forEach((id) => {
          if (ctxRef?.layerManager?.get(id)) {
            ctxRef.layerManager.remove(id, { removeSource: false })
          }
        })
      }
      nodeIds.length = 0
      popup?.close()
      rainfall?.destroy()
      rainfall = null
      entities = []
      entityMap = new Map()
      nodes = []
      data = null
      ctxRef = null
    }
  }

  return feature
}
