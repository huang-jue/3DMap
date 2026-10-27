import type { CesiumFeature, FeatureContext } from '@sgyx/cesium-kit-core'
import { loadFloodDataset } from './data/loadFloodData'
import {
  createEmergencyPlanFeature,
  type EmergencyPlanFeature,
  type PlanGenerateInput
} from './features/createEmergencyPlanFeature'
import {
  createFloodForecastFeature,
  type FloodForecastFeature
} from './features/createFloodForecastFeature'
import {
  createFloodRehearsalFeature,
  type FloodRehearsalFeature,
  type RehearsalMode
} from './features/createFloodRehearsalFeature'
import {
  createFloodWarningFeature,
  type FloodWarningFeature
} from './features/createFloodWarningFeature'
import { createHydroDataFeature, type HydroDataFeature } from './features/createHydroDataFeature'
import type { FloodDataset, FloodWarning, ForecastNode, GeneratedPlan } from './shared/types'

export type FloodPluginErrorKey = 'hydro' | 'forecast' | 'warnings' | 'rehearsal' | 'plan'

export interface FloodPluginConfig {
  data: FloodDataset | string
  name?: string
  digitalMirrorUrl?: string
  scenarioId?: string
  mode?: RehearsalMode
  visible?: boolean
  followClock?: boolean
  syncClockRange?: boolean
  showRainfall?: boolean
  showPopup?: boolean
  continueOnError?: boolean
  onLayerError?: (key: FloodPluginErrorKey, error: unknown) => void
  onForecastSelect?: (node: ForecastNode | null) => void
  onWarningSelect?: (warning: FloodWarning | null) => void
  onGenerate?: (plan: GeneratedPlan) => void
}

export interface FloodPlugin extends CesiumFeature<FloodPluginConfig> {
  readonly data: FloodDataset | null
  readonly hydro: HydroDataFeature | null
  readonly forecast: FloodForecastFeature | null
  readonly warnings: FloodWarningFeature | null
  readonly rehearsal: FloodRehearsalFeature | null
  readonly plan: EmergencyPlanFeature | null
  readonly errors: Partial<Record<FloodPluginErrorKey, unknown>>
  setRiversVisible(visible: boolean): void
  setProjectsVisible(visible: boolean): void
  setStationsVisible(visible: boolean): void
  setDigitalMirrorVisible(visible: boolean): void
  setForecastVisible(visible: boolean): void
  setRainfallVisible(visible: boolean): void
  setWarningsVisible(visible: boolean): void
  setRehearsalVisible(visible: boolean): void
  setRehearsalMode(mode: RehearsalMode): void
  setScenario(id: string): void
  play(): void
  pause(): void
  searchKnowledge(keyword: string): ReturnType<EmergencyPlanFeature['search']>
  generatePlan(input?: PlanGenerateInput): GeneratedPlan | null
}

/** 水旱灾害防御“四预”组合插件。 */
export function createFloodPlugin(config: FloodPluginConfig): FloodPlugin {
  let data: FloodDataset | null = null
  let hydro: HydroDataFeature | null = null
  let forecast: FloodForecastFeature | null = null
  let warnings: FloodWarningFeature | null = null
  let rehearsal: FloodRehearsalFeature | null = null
  let plan: EmergencyPlanFeature | null = null
  let disposed = false
  let continueOnError = false
  let activeConfig: FloodPluginConfig = config
  const errors: Partial<Record<FloodPluginErrorKey, unknown>> = {}

  const report = (key: FloodPluginErrorKey, error: unknown): void => {
    errors[key] = error
    activeConfig.onLayerError?.(key, error)
    if (!continueOnError) throw error
  }

  const install = async (ctx: FeatureContext, options?: FloodPluginConfig): Promise<void> => {
    disposed = false
    const merged = { ...config, ...options }
    activeConfig = merged
    continueOnError = merged.continueOnError ?? false
    data = await loadFloodDataset(merged.data)
    if (disposed) return

    try {
      hydro = createHydroDataFeature({
        data,
        visible: merged.visible ?? true,
        digitalMirrorUrl: merged.digitalMirrorUrl
      })
      await hydro.install(ctx, {
        data,
        visible: merged.visible ?? true,
        digitalMirrorUrl: merged.digitalMirrorUrl
      })
    } catch (error) {
      report('hydro', error)
    }

    try {
      forecast = createFloodForecastFeature({
        data,
        visible: merged.visible ?? true,
        showRainfall: merged.showRainfall ?? false,
        followClock: merged.followClock ?? true,
        onSelect: merged.onForecastSelect
      })
      await forecast.install(ctx, {
        data,
        visible: merged.visible ?? true,
        showRainfall: merged.showRainfall ?? false,
        followClock: merged.followClock ?? true,
        onSelect: merged.onForecastSelect
      })
    } catch (error) {
      report('forecast', error)
    }

    try {
      warnings = createFloodWarningFeature({
        data,
        visible: merged.visible ?? true,
        showPopup: merged.showPopup ?? true,
        onSelect: merged.onWarningSelect
      })
      await warnings.install(ctx, {
        data,
        visible: merged.visible ?? true,
        showPopup: merged.showPopup ?? true,
        onSelect: merged.onWarningSelect
      })
    } catch (error) {
      report('warnings', error)
    }

    try {
      rehearsal = createFloodRehearsalFeature({
        data,
        scenarioId: merged.scenarioId,
        mode: merged.mode,
        visible: merged.visible ?? true,
        followClock: merged.followClock ?? true,
        syncClockRange: merged.syncClockRange ?? true
      })
      await rehearsal.install(ctx, {
        data,
        scenarioId: merged.scenarioId,
        mode: merged.mode,
        visible: merged.visible ?? true,
        followClock: merged.followClock ?? true,
        syncClockRange: merged.syncClockRange ?? true
      })
    } catch (error) {
      report('rehearsal', error)
    }

    try {
      plan = createEmergencyPlanFeature({
        data,
        onGenerate: merged.onGenerate
      })
      await plan.install(ctx, { data, onGenerate: merged.onGenerate })
    } catch (error) {
      report('plan', error)
    }

    ctx.log.info('水旱灾害防御四预插件已启用')
  }

  const plugin: FloodPlugin = {
    name: config.name ?? 'flood-plugin',
    get data() {
      return data
    },
    get hydro() {
      return hydro
    },
    get forecast() {
      return forecast
    },
    get warnings() {
      return warnings
    },
    get rehearsal() {
      return rehearsal
    },
    get plan() {
      return plan
    },
    get errors() {
      return { ...errors }
    },
    install,
    setRiversVisible(value) {
      hydro?.setRiversVisible(value)
    },
    setProjectsVisible(value) {
      hydro?.setProjectsVisible(value)
    },
    setStationsVisible(value) {
      hydro?.setStationsVisible(value)
    },
    setDigitalMirrorVisible(value) {
      hydro?.setDigitalMirrorVisible(value)
    },
    setForecastVisible(value) {
      forecast?.setVisible(value)
    },
    setRainfallVisible(value) {
      forecast?.setRainfallVisible(value)
    },
    setWarningsVisible(value) {
      warnings?.setVisible(value)
    },
    setRehearsalVisible(value) {
      rehearsal?.setVisible(value)
    },
    setRehearsalMode(mode) {
      rehearsal?.setMode(mode)
    },
    setScenario(id) {
      rehearsal?.setScenario(id)
    },
    play() {
      rehearsal?.play()
    },
    pause() {
      rehearsal?.pause()
    },
    searchKnowledge(keyword) {
      return plan?.search(keyword) ?? []
    },
    generatePlan(input) {
      return plan?.generate(input) ?? null
    },
    dispose() {
      disposed = true
      hydro?.dispose?.()
      forecast?.dispose?.()
      warnings?.dispose?.()
      rehearsal?.dispose?.()
      plan?.dispose?.()
      hydro = null
      forecast = null
      warnings = null
      rehearsal = null
      plan = null
      data = null
    }
  }

  return plugin
}
