import * as Cesium from 'cesium'
import type { EventBus } from '../events/EventBus'
import type { CameraView, CesiumKitEventMap, ColorInput, SceneModeName } from '../types'
import { toColor } from '../utils/color'
import { createLogger, type Logger } from '../utils/logger'

const MORPH: Record<SceneModeName, (scene: Cesium.Scene, duration: number) => void> = {
  '3D': (scene, duration) => scene.morphTo3D(duration),
  '2D': (scene, duration) => scene.morphTo2D(duration),
  COLUMBUS_VIEW: (scene, duration) => scene.morphToColumbusView(duration)
}

const MODE_NAME: Record<number, SceneModeName> = {
  [Cesium.SceneMode.SCENE3D]: '3D',
  [Cesium.SceneMode.SCENE2D]: '2D',
  [Cesium.SceneMode.COLUMBUS_VIEW]: 'COLUMBUS_VIEW'
}

/** 相机读写桥接，用于在投影切换后还原视角。 */
export interface SceneViewBridge {
  getView(): CameraView
  setView(
    target: { lon: number; lat: number; height: number },
    options?: { heading?: number; pitch?: number; roll?: number }
  ): void
}

export interface ScreenshotOptions {
  /** MIME 类型，默认 image/png */
  type?: string
  /** 0-1，仅对 image/jpeg、image/webp 生效 */
  quality?: number
}

export interface ScreenshotResult {
  dataUrl: string
  blob: Blob | null
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  if (typeof atob !== 'function' || typeof Blob === 'undefined') return null
  const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl)
  if (!match) return null
  const binary = atob(match[2] ?? '')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: match[1] })
}

export class SceneService {
  private log: Logger
  /** 用于丢弃被新切换取消的 morph 回调 */
  private morphToken = 0
  private pendingComplete: (() => void) | null = null
  private preserveDrawingBuffer = false

  constructor(
    private readonly viewer: Cesium.Viewer,
    private readonly events: EventBus<CesiumKitEventMap>,
    private readonly bridge?: SceneViewBridge,
    logger?: Logger
  ) {
    this.log = logger ?? createLogger('scene')
  }

  /**
   * 切换投影模式，默认 1 秒过渡。
   * Cesium 在 morph 后会丢失原视角，这里在过渡结束后回写，保证切换前后视野一致。
   * 连续切换时只保留最后一次回写，避免回写过期视角与监听器泄漏。
   */
  setMode(mode: SceneModeName, duration = 1): void {
    const morph = MORPH[mode]
    if (!morph) {
      this.log.warn(`未知场景模式：${mode}`)
      return
    }

    this.clearPending()
    const scene = this.viewer.scene
    if (scene.morphTime > 0 && scene.morphTime < 1) scene.completeMorph()
    if (this.getMode() === mode) return

    const previous = this.bridge?.getView()
    const token = ++this.morphToken

    if (duration <= 0) {
      morph(scene, 0)
      if (previous) this.restoreView(previous)
      this.events.emit('scene:mode', mode)
      return
    }

    const onComplete = (): void => {
      if (token !== this.morphToken) return
      this.clearPending()
      if (previous && !this.viewer.isDestroyed()) this.restoreView(previous)
    }
    this.pendingComplete = onComplete
    scene.morphComplete.addEventListener(onComplete)

    morph(scene, duration)
    this.events.emit('scene:mode', mode)
  }

  getMode(): SceneModeName {
    return MODE_NAME[this.viewer.scene.mode] ?? '3D'
  }

  setLighting(enabled: boolean): void {
    this.viewer.scene.globe.enableLighting = enabled
  }

  setDepthTestAgainstTerrain(enabled: boolean): void {
    this.viewer.scene.globe.depthTestAgainstTerrain = enabled
  }

  setFog(enabled: boolean): void {
    if (this.viewer.scene.fog) this.viewer.scene.fog.enabled = enabled
  }

  setSkyAtmosphere(enabled: boolean): void {
    if (this.viewer.scene.skyAtmosphere) {
      this.viewer.scene.skyAtmosphere.show = enabled
    }
  }

  /** 天空盒与星空由 Cesium 绑定在一起，关闭后星空一并隐藏。 */
  setSkyBox(visible: boolean): void {
    if (this.viewer.scene.skyBox) this.viewer.scene.skyBox.show = visible
  }

  setSun(visible: boolean): void {
    if (this.viewer.scene.sun) this.viewer.scene.sun.show = visible
  }

  setMoon(visible: boolean): void {
    if (this.viewer.scene.moon) this.viewer.scene.moon.show = visible
  }

  setGlobeVisible(visible: boolean): void {
    this.viewer.scene.globe.show = visible
  }

  /** 无底图时的地球底色。 */
  setBaseColor(color: ColorInput): void {
    this.viewer.scene.globe.baseColor = toColor(color)
  }

  /**
   * 导出当前画面。需要创建 Viewer 时开启 `preserveDrawingBuffer: true`，
   * 否则 WebGL 画布在合成后会被清空，无法读取像素。
   */
  screenshot(options: ScreenshotOptions = {}): ScreenshotResult {
    if (!this.preserveDrawingBuffer) {
      throw new Error(
        '@cesium-kit/core: 截图需要在创建 Viewer 时开启 preserveDrawingBuffer: true'
      )
    }
    const canvas = this.viewer.scene.canvas
    const type = options.type ?? 'image/png'
    const dataUrl = canvas.toDataURL(type, options.quality)
    return { dataUrl, blob: dataUrlToBlob(dataUrl) }
  }

  /** 由内核在创建 Viewer 后同步能力标记。 */
  setPreserveDrawingBuffer(enabled: boolean): void {
    this.preserveDrawingBuffer = enabled
  }

  /** 按需渲染，静止时不重绘，可显著降低 GPU 占用。 */
  setRequestRenderMode(enabled: boolean, maximumRenderTimeChange = Infinity): void {
    this.viewer.scene.requestRenderMode = enabled
    this.viewer.scene.maximumRenderTimeChange = maximumRenderTimeChange
  }

  /** 请求一次重绘，requestRenderMode 开启时使用。 */
  requestRender(): void {
    this.viewer.scene.requestRender()
  }

  destroy(): void {
    this.clearPending()
  }

  private clearPending(): void {
    if (!this.pendingComplete) return
    this.viewer.scene.morphComplete.removeEventListener(this.pendingComplete)
    this.pendingComplete = null
  }

  private restoreView(view: CameraView): void {
    this.bridge?.setView(
      { lon: view.lon, lat: view.lat, height: view.height },
      { heading: view.heading, pitch: view.pitch, roll: view.roll }
    )
  }
}
