import * as Cesium from 'cesium'
import { CesiumViewerManager } from '@sgyx/cesium-kit-core'
import { createEarthPlugin, type EarthPlugin } from '../createEarthPlugin'
import type { EarthPluginState } from '../shared/types'
import { validateEarthState } from '../data/validateEarthState'

export interface EarthCompareState {
  mode: 'split' | 'curtain'
  position: number
  cameraLinked: boolean
  timeLinked: boolean
  secondary: EarthPluginState
  time: string
}
/** A second viewer is owned exclusively by this controller. Parsed data uses the shared repository. */
export class EarthCompareController {
  secondary: CesiumViewerManager | null = null
  plugin: EarthPlugin | null = null
  private disposed = false
  private sequence = 0
  private applying = false
  private cleanups: Array<() => void> = []
  private state: EarthCompareState
  private widget: HTMLElement
  private originalStyle: string | null
  constructor(
    private primary: CesiumViewerManager,
    private host: HTMLElement,
    state: EarthCompareState
  ) {
    this.state = JSON.parse(JSON.stringify(state)) as EarthCompareState
    validateEarthState(this.state.secondary)
    if (
      !['split', 'curtain'].includes(state.mode) ||
      !Number.isFinite(state.position) ||
      state.position < 5 ||
      state.position > 95 ||
      !Number.isFinite(Date.parse(state.time))
    )
      throw new Error('非法比较配置')
    this.widget = primary.viewer.container.querySelector<HTMLElement>(':scope > .cesium-viewer')!
    this.originalStyle = this.widget?.getAttribute('style') ?? null
    Object.assign(host.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' })
  }
  async initialize(): Promise<void> {
    const viewer = await CesiumViewerManager.create(this.host, {
      showCredits: false,
      imagery: [{ source: 'naturalEarth' }],
      verifyAssets: false
    })
    if (this.disposed) {
      viewer.destroy()
      return
    }
    this.secondary = viewer
    this.applyLayout()
    this.cleanups.push(this.primary.camera.onChange(() => this.syncCamera(this.primary, viewer)))
    this.cleanups.push(viewer.camera.onChange(() => this.syncCamera(viewer, this.primary)))
    this.cleanups.push(
      this.primary.clock.onStateChange(({ currentTime }) => this.syncTime(currentTime))
    )
    this.cleanups.push(this.primary.clock.onTick(({ currentTime }) => this.syncTime(currentTime)))
    const observer = new ResizeObserver(() => this.applyLayout())
    observer.observe(this.primary.viewer.container)
    this.cleanups.push(() => observer.disconnect())
    await this.setSecondary(this.state.secondary)
    if (!this.disposed) {
      this.syncCamera(this.primary, viewer)
      if (this.state.timeLinked) this.syncTime(this.primary.clock.state.currentTime)
      else viewer.clock.seek(new Date(this.state.time))
    }
  }
  private syncCamera(from: CesiumViewerManager, to: CesiumViewerManager): void {
    if (
      this.disposed ||
      this.applying ||
      (!this.state.cameraLinked && this.state.mode !== 'curtain')
    )
      return
    this.applying = true
    try {
      const sourceView = from.camera.getView()
      const targetView = to.camera.getView()
      const sameView = (Object.keys(sourceView) as Array<keyof typeof sourceView>).every(
        (key) => Math.abs(sourceView[key] - targetView[key]) < (key === 'height' ? 0.01 : 0.000001)
      )
      const source = from.viewer.scene
      const target = to.viewer.scene
      const sameFrustum =
        source.camera.frustum.constructor === target.camera.frustum.constructor &&
        (!(source.camera.frustum instanceof Cesium.OrthographicFrustum) ||
          Math.abs(
            (source.camera.frustum.width ?? 0) -
              ((target.camera.frustum as Cesium.OrthographicFrustum).width ?? 0)
          ) < 0.01)
      if (sameView && sameFrustum && source.mode === target.mode) return
      if (source.mode !== target.mode) to.scene.setMode(from.scene.getMode(), 0)
      if (source.camera.frustum instanceof Cesium.OrthographicFrustum) {
        if (!(target.camera.frustum instanceof Cesium.OrthographicFrustum))
          target.camera.switchToOrthographicFrustum()
        ;(target.camera.frustum as Cesium.OrthographicFrustum).width = source.camera.frustum.width
      } else if (target.mode === Cesium.SceneMode.SCENE3D)
        target.camera.switchToPerspectiveFrustum()
      to.camera.setView(from.camera.getView(), from.camera.getView())
      target.requestRender()
    } finally {
      this.applying = false
    }
  }
  private syncTime(time: Date): void {
    const target = this.secondary
    if (!target || !this.state.timeLinked || this.disposed) return
    const range = target.clock.state
    const bounded = Math.min(
      range.stopTime?.getTime() ?? Infinity,
      Math.max(range.startTime?.getTime() ?? -Infinity, time.getTime())
    )
    if (range.currentTime.getTime() !== bounded) target.clock.seek(new Date(bounded))
  }
  async setSecondary(state: EarthPluginState): Promise<void> {
    validateEarthState(state)
    const viewer = this.secondary
    if (!viewer || this.disposed) return
    const request = ++this.sequence
    if (this.plugin) viewer.features.unregister(this.plugin.name)
    const plugin = createEarthPlugin({
      data: state.dataRef,
      dataRef: state.dataRef,
      name: `earth-compare-${request}`,
      mode: state.mode,
      level: state.level,
      overlay: state.overlay,
      vector: state.vector,
      annotations: [],
      settings: state.settings
    })
    this.plugin = plugin
    await viewer.features.register(plugin)
    if (this.disposed || request !== this.sequence) {
      viewer.features.unregister(plugin.name)
      return
    }
    plugin.setProjection(state.projection)
    this.state.secondary = {
      ...state,
      annotations: [],
      weather: { points: false, warnings: false, windFarm: false }
    }
    if (this.state.timeLinked) this.syncTime(this.primary.clock.state.currentTime)
    this.syncCamera(this.primary, viewer)
    const error = Object.values(plugin.errors)[0]
    if (error) throw error
  }
  update(
    options: Partial<Pick<EarthCompareState, 'mode' | 'position' | 'cameraLinked' | 'timeLinked'>>
  ): void {
    Object.assign(this.state, options)
    this.applyLayout()
    if (this.secondary) {
      this.syncCamera(this.primary, this.secondary)
      this.syncTime(this.primary.clock.state.currentTime)
    }
  }
  setTime(time: string): void {
    if (!Number.isFinite(Date.parse(time))) throw new Error('非法比较时刻')
    this.state.time = time
    this.secondary?.clock.seek(new Date(time))
  }
  getState(): EarthCompareState {
    return {
      ...JSON.parse(JSON.stringify(this.state)),
      time: this.secondary?.clock.state.currentTime.toISOString() ?? this.state.time
    }
  }
  private applyLayout(): void {
    if (this.disposed || !this.widget) return
    const mobile = this.primary.viewer.container.clientWidth <= 720
    const split = this.state.mode === 'split'
    Object.assign(this.widget.style, {
      width: split && !mobile ? '50%' : '100%',
      height: split && mobile ? '50%' : '100%'
    })
    Object.assign(this.host.style, {
      position: 'absolute',
      left: split && !mobile ? '50%' : '0',
      top: split && mobile ? '50%' : '0',
      width: split && !mobile ? '50%' : '100%',
      height: split && mobile ? '50%' : '100%',
      clipPath: split ? '' : `inset(0 0 0 ${this.state.position}%)`,
      pointerEvents: split ? 'auto' : 'none'
    })
    this.primary.viewer.resize()
    this.secondary?.viewer.resize()
  }
  destroy(): void {
    if (this.disposed) return
    this.disposed = true
    this.sequence++
    this.cleanups.forEach((off) => off())
    this.cleanups = []
    this.secondary?.destroy()
    this.secondary = null
    this.plugin = null
    if (this.widget) {
      if (this.originalStyle === null) this.widget.removeAttribute('style')
      else this.widget.setAttribute('style', this.originalStyle)
    }
    if (!this.primary.viewer.isDestroyed()) this.primary.viewer.resize()
  }
}
