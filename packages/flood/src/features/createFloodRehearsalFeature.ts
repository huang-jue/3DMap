import type { CesiumFeature, FeatureContext } from '@sgyx/cesium-kit-core'
import { loadFloodDataset } from '../data/loadFloodData'
import { findNearestIndex } from '../data/time'
import { BreachLayer } from '../layers/BreachLayer'
import { DispatchLayer } from '../layers/DispatchLayer'
import { FloodRasterLayer } from '../layers/FloodRasterLayer'
import { InundationPolygonLayer } from '../layers/InundationPolygonLayer'
import { ensureFloodLayerGroup } from '../shared/layerTree'
import { DEPTH_COLORS } from '../shared/palettes'
import type {
  BreachConfig,
  DispatchPlan,
  DispatchProject,
  FloodDataset,
  RehearsalScenario
} from '../shared/types'

export type RehearsalMode = 'raster' | 'polygon'

export interface FloodRehearsalFeatureOptions {
  data: FloodDataset | string
  scenarioId?: string
  mode?: RehearsalMode
  visible?: boolean
  followClock?: boolean
  syncClockRange?: boolean
  name?: string
  onScenarioChange?: (scenario: RehearsalScenario) => void
  onProjectSelect?: (project: DispatchProject | null) => void
}

export interface FloodRehearsalFeature extends CesiumFeature<FloodRehearsalFeatureOptions> {
  readonly data: FloodDataset | null
  readonly scenarios: RehearsalScenario[]
  readonly scenario: RehearsalScenario | null
  readonly breach: BreachConfig | null
  readonly dispatch: DispatchPlan | null
  setScenario(id: string): void
  setMode(mode: RehearsalMode): void
  setVisible(visible: boolean): void
  setTime(time: Date): void
  play(): void
  pause(): void
}

/** 预演：淹没栅格/面、溃口、联合调度场景。 */
export function createFloodRehearsalFeature(
  defaultOptions: FloodRehearsalFeatureOptions
): FloodRehearsalFeature {
  let data: FloodDataset | null = null
  let scenarios: RehearsalScenario[] = []
  let scenario: RehearsalScenario | null = null
  let rasterLayer: FloodRasterLayer | null = null
  let polygonLayer: InundationPolygonLayer | null = null
  let breachLayer: BreachLayer | null = null
  let dispatchLayer: DispatchLayer | null = null
  let ctxRef: FeatureContext | null = null
  let unsubscribeTick: (() => void) | undefined
  let nodeIds: string[] = []
  let mode: RehearsalMode = defaultOptions.mode ?? 'raster'
  let visible = defaultOptions.visible ?? true
  let followClock = defaultOptions.followClock ?? true
  let syncClockRange = defaultOptions.syncClockRange ?? true
  let disposed = false

  const clearNodes = (): void => {
    if (!ctxRef?.layerManager) return
    nodeIds.forEach((id) => {
      if (ctxRef?.layerManager?.get(id)) {
        ctxRef.layerManager.remove(id, { removeSource: false })
      }
    })
    nodeIds = []
  }

  const clearLayers = (): void => {
    rasterLayer?.destroy()
    polygonLayer?.destroy()
    breachLayer?.destroy()
    dispatchLayer?.destroy()
    rasterLayer = null
    polygonLayer = null
    breachLayer = null
    dispatchLayer = null
    clearNodes()
  }

  const attach = (
    id: string,
    name: string,
    handle: {
      setVisible: (value: boolean) => void
      destroy?: () => void
    },
    initialVisible: boolean
  ): void => {
    if (!ctxRef?.layerManager) return
    try {
      ctxRef.layerManager.addCustom(name, {
        id,
        parentId: ensureFloodLayerGroup(ctxRef),
        visible: initialVisible,
        handle
      })
      nodeIds.push(id)
    } catch {
      // 忽略重复节点
    }
  }

  const createScenarioLayers = (): void => {
    if (!ctxRef || !scenario) return
    const ctx = ctxRef

    if (scenario.rasterFrames && scenario.rasterFrames.length > 0) {
      rasterLayer = new FloodRasterLayer(ctx.viewer, scenario.rasterFrames[0]!, {
        visible: visible && mode === 'raster',
        colors: DEPTH_COLORS,
        min: 0,
        max: 10
      })
      rasterLayer.add()
      attach(
        'flood-rehearsal-raster',
        '淹没栅格',
        {
          setVisible: (value) => {
            if (rasterLayer) rasterLayer.show = value
          },
          destroy: () => {
            rasterLayer?.destroy()
            rasterLayer = null
          }
        },
        visible && mode === 'raster'
      )
    }

    if (scenario.polygonFrames && scenario.polygonFrames.length > 0) {
      polygonLayer = new InundationPolygonLayer(ctx.viewer, scenario.polygonFrames, {
        visible: visible && mode === 'polygon',
        addEntity: (entity) => ctx.layers.add(entity)
      })
      attach(
        'flood-rehearsal-polygon',
        '淹没面',
        {
          setVisible: (value) => polygonLayer?.setVisible(value),
          destroy: () => {
            polygonLayer?.destroy()
            polygonLayer = null
          }
        },
        visible && mode === 'polygon'
      )
    }

    if (scenario.breach) {
      breachLayer = new BreachLayer(ctx.viewer, scenario.breach, {
        visible,
        addEntity: (entity) => ctx.layers.add(entity)
      })
      attach(
        'flood-rehearsal-breach',
        '溃口',
        {
          setVisible: (value) => breachLayer?.setVisible(value),
          destroy: () => {
            breachLayer?.destroy()
            breachLayer = null
          }
        },
        visible
      )
    }

    if (scenario.dispatch) {
      dispatchLayer = new DispatchLayer(ctx.viewer, scenario.dispatch, {
        visible,
        onSelect: defaultOptions.onProjectSelect,
        addEntity: (entity) => ctx.layers.add(entity)
      })
      attach(
        'flood-rehearsal-dispatch',
        '联合调度',
        {
          setVisible: (value) => dispatchLayer?.setVisible(value),
          destroy: () => {
            dispatchLayer?.destroy()
            dispatchLayer = null
          }
        },
        visible
      )
    }
  }

  const applyScenarioTime = (time: Date): void => {
    if (!scenario) return
    if (scenario.rasterFrames && rasterLayer) {
      const index = findNearestIndex(scenario.rasterFrames, time)
      const frame = scenario.rasterFrames[index]
      if (frame) rasterLayer.updateFrame(frame)
    }
    polygonLayer?.setTime(time)
  }

  const selectScenario = (id: string): void => {
    const next = scenarios.find((item) => item.id === id)
    if (!next || !ctxRef) return
    clearLayers()
    scenario = next
    createScenarioLayers()
    if (syncClockRange) {
      ctxRef.clock.setRange(next.startTime, next.endTime)
      ctxRef.clock.seek(next.startTime)
    }
    applyScenarioTime(ctxRef.clock.state.currentTime)
    defaultOptions.onScenarioChange?.(next)
    ctxRef.log.info(`预演场景已切换：${next.name}`)
  }

  const install = async (
    ctx: FeatureContext,
    options?: FloodRehearsalFeatureOptions
  ): Promise<void> => {
    disposed = false
    ctxRef = ctx
    const merged = { ...defaultOptions, ...options }
    mode = merged.mode ?? 'raster'
    visible = merged.visible ?? true
    followClock = merged.followClock ?? true
    syncClockRange = merged.syncClockRange ?? true
    data = await loadFloodDataset(merged.data)
    if (disposed) return
    scenarios = data.rehearsals
    const first = merged.scenarioId
      ? scenarios.find((item) => item.id === merged.scenarioId)
      : scenarios[0]
    if (!first) {
      ctx.log.warn('没有可用的预演场景')
      return
    }
    scenario = first
    createScenarioLayers()
    if (syncClockRange) {
      ctx.clock.setRange(first.startTime, first.endTime)
      ctx.clock.seek(first.startTime)
    }
    applyScenarioTime(ctx.clock.state.currentTime)

    if (followClock) {
      unsubscribeTick = ctx.clock.onTick(({ currentTime }) => {
        applyScenarioTime(currentTime)
      })
    }
    ctx.layers.onDispose(() => {
      unsubscribeTick?.()
      clearLayers()
    })
    ctx.log.info(`预演已加载：${first.name}`)
  }

  const feature: FloodRehearsalFeature = {
    name: defaultOptions.name ?? 'flood-rehearsal',
    get data() {
      return data
    },
    get scenarios() {
      return scenarios
    },
    get scenario() {
      return scenario
    },
    get breach() {
      return scenario?.breach ?? null
    },
    get dispatch() {
      return scenario?.dispatch ?? null
    },
    install,
    setScenario(id) {
      selectScenario(id)
    },
    setMode(next) {
      mode = next
      if (rasterLayer) rasterLayer.show = visible && next === 'raster'
      if (polygonLayer) polygonLayer.setVisible(visible && next === 'polygon')
    },
    setVisible(value) {
      visible = value
      if (rasterLayer) rasterLayer.show = value && mode === 'raster'
      if (polygonLayer) polygonLayer.setVisible(value && mode === 'polygon')
      breachLayer?.setVisible(value)
      dispatchLayer?.setVisible(value)
    },
    setTime(time) {
      if (ctxRef) ctxRef.clock.seek(time)
      applyScenarioTime(time)
    },
    play() {
      ctxRef?.clock.play()
    },
    pause() {
      ctxRef?.clock.pause()
    },
    dispose() {
      disposed = true
      unsubscribeTick?.()
      unsubscribeTick = undefined
      clearLayers()
      scenarios = []
      scenario = null
      data = null
      ctxRef = null
    }
  }

  return feature
}
