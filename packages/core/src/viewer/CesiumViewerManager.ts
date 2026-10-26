import { SelectionService } from '../selection/SelectionService'
import { SceneSnapshotService } from '../snapshot/SceneSnapshotService'
import * as Cesium from 'cesium'
import { CameraService, createHomeView } from '../camera/CameraService'
import { ClockService } from '../clock/ClockService'
import { createCoordService, type CoordService } from '../coords'
import { DataSourceManager } from '../datasource/DataSourceManager'
import { DrawService } from '../draw/DrawService'
import { EntityService } from '../entity/EntityService'
import { EventBus } from '../events/EventBus'
import { FeatureRegistry } from '../feature/FeatureRegistry'
import { ImageryManager } from '../imagery/ImageryManager'
import { LayerManager } from '../layer/LayerManager'
import { PickService } from '../pick/PickService'
import { PopupService } from '../popup/PopupService'
import { SceneService } from '../scene/SceneService'
import { TerrainManager } from '../terrain/TerrainManager'
import { TilesetManager } from '../tileset/TilesetManager'
import type { CesiumKitEventMap } from '../types'
import { createLogger, setLogLevel } from '../utils/logger'
import { assertBrowser } from '../utils/ssr'
import { verifyCesiumAssets } from '../utils/verifyAssets'
import { resolveOptions, type CesiumKitOptions, type ResolvedCesiumKitOptions } from './options'

type BuildModuleUrl = typeof Cesium.buildModuleUrl & { setBaseUrl(baseUrl: string): void }

export interface ViewerAssetsStatus {
  imagery: boolean
  terrain: boolean
}

export class CesiumViewerManager {
  readonly selection: SelectionService
  readonly snapshots: SceneSnapshotService
  readonly events = new EventBus<CesiumKitEventMap>()
  readonly viewer: Cesium.Viewer
  readonly imagery: ImageryManager
  readonly terrain: TerrainManager
  readonly camera: CameraService
  readonly scene: SceneService
  readonly entities: EntityService
  readonly features: FeatureRegistry
  readonly coords: CoordService
  readonly pick: PickService
  readonly clock: ClockService
  readonly dataSources: DataSourceManager
  readonly tilesets: TilesetManager
  readonly draw: DrawService
  readonly popup: PopupService
  readonly layerManager: LayerManager
  readonly options: ResolvedCesiumKitOptions

  private log = createLogger('viewer')
  private destroyed = false

  private constructor(container: HTMLElement, options: ResolvedCesiumKitOptions) {
    this.options = options

    const viewerOptions = {
      baseLayer: false,
      animation: options.animation,
      timeline: options.timeline,
      geocoder: options.geocoder,
      homeButton: options.homeButton,
      sceneModePicker: options.sceneModePicker,
      baseLayerPicker: options.baseLayerPicker,
      navigationHelpButton: options.navigationHelpButton,
      fullscreenButton: options.fullscreenButton,
      infoBox: options.infoBox,
      selectionIndicator: options.selectionIndicator,
      shouldAnimate: options.shouldAnimate,
      preserveDrawingBuffer: options.preserveDrawingBuffer,
      skyBox: options.skyBox,
      sun: options.sun,
      moon: options.moon,
      globe: options.globe,
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      ...options.viewerOptions
    } as Cesium.Viewer.ConstructorOptions

    this.viewer = new Cesium.Viewer(container, viewerOptions)

    if (!options.showCredits) {
      const credit = this.viewer.cesiumWidget?.creditContainer as HTMLElement | undefined
      if (credit?.style) credit.style.display = 'none'
    }

    this.imagery = new ImageryManager(this.viewer, this.events)
    this.terrain = new TerrainManager(this.viewer)
    this.entities = new EntityService(this.viewer)
    this.coords = createCoordService(this.viewer)
    this.pick = new PickService(this.viewer)
    this.clock = new ClockService(this.viewer, this.events, options.clock)
    this.dataSources = new DataSourceManager(this.viewer, undefined, undefined, this.events)
    this.tilesets = new TilesetManager(this.viewer, undefined, undefined, this.events)
    this.draw = new DrawService(this.viewer, this.coords, {
      pick: this.pick,
      events: this.events
    })
    this.popup = new PopupService(this.viewer)
    this.layerManager = new LayerManager({
      viewer: this.viewer,
      imagery: this.imagery,
      dataSources: this.dataSources,
      tilesets: this.tilesets,
      events: this.events
    })
    this.camera = new CameraService(
      this.viewer,
      this.events,
      options.camera,
      options.homeView ? createHomeView(options.homeView, options.homeOrientation) : null
    )
    this.scene = new SceneService(this.viewer, this.events, this.camera)
    this.scene.setPreserveDrawingBuffer(options.preserveDrawingBuffer)
    this.selection = new SelectionService(this)
    this.snapshots = new SceneSnapshotService(this)
    this.features = new FeatureRegistry({
      viewer: this.viewer,
      coords: this.coords,
      events: this.events,
      imagery: this.imagery,
      pick: this.pick,
      clock: this.clock,
      dataSources: this.dataSources,
      tilesets: this.tilesets,
      popup: this.popup,
      layerManager: this.layerManager
    })
  }

  /** 创建并完成初始化（底图、地形、初始视角），可直接 await。 */
  static async create(
    container: HTMLElement,
    options: CesiumKitOptions = {}
  ): Promise<CesiumViewerManager> {
    assertBrowser('Viewer 创建')
    if (!container) throw new Error('@cesium-kit/core: 缺少容器元素 container')

    const resolved = resolveOptions(options)
    if (resolved.logLevel) setLogLevel(resolved.logLevel)

    if (resolved.ionToken) {
      Cesium.Ion.defaultAccessToken = resolved.ionToken
    }
    if (resolved.cesiumBaseUrl) {
      ;(Cesium.buildModuleUrl as BuildModuleUrl).setBaseUrl(resolved.cesiumBaseUrl)
    }

    const manager = new CesiumViewerManager(container, resolved)
    try {
      await manager.init()
    } catch (error) {
      manager.destroy()
      throw error
    }
    return manager
  }

  get isReady(): boolean {
    return !this.destroyed
  }

  isDestroyed(): boolean {
    return this.destroyed
  }

  getViewer(): Cesium.Viewer {
    if (this.destroyed || this.viewer.isDestroyed()) {
      throw new Error('@cesium-kit/core: Viewer 已销毁，不能再访问')
    }
    return this.viewer
  }

  /** 视角复位到 homeView。 */
  flyHome(duration = 1.5): void {
    this.camera.flyHome(duration)
  }

  setSceneMode(mode: '3D' | '2D' | 'COLUMBUS_VIEW', duration = 1): void {
    this.scene.setMode(mode, duration)
  }

  /** 逆序释放所有资源，可重复调用。 */
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true

    this.selection.destroy()
    this.snapshots.destroy()
    this.features.destroy()
    this.draw.destroy()
    this.popup.destroy()
    this.layerManager.destroy()
    this.pick.destroy()
    this.clock.destroy()
    this.dataSources.destroy()
    this.tilesets.destroy()
    this.terrain.destroy()
    this.camera.destroy()
    this.scene.destroy()

    if (!this.viewer.isDestroyed()) {
      this.imagery.destroy()
      this.entities.destroy()
    }

    this.events.emit('destroyed', undefined)
    this.events.clear()

    if (!this.viewer.isDestroyed()) {
      try {
        this.viewer.destroy()
      } catch (error) {
        this.log.error('Viewer 销毁失败', error)
      }
    }
  }

  private async init(): Promise<void> {
    const { options } = this

    if (options.verifyAssets) {
      const result = await verifyCesiumAssets(
        typeof options.verifyAssets === 'object' ? options.verifyAssets : {}
      )
      if (!result.ok) {
        const failed = result.checks
          .filter((check) => !check.ok)
          .map(
            (check) => `${check.name} (${check.url}${check.status ? ` -> ${check.status}` : ''})`
          )
          .join('；')
        this.events.emit('error', {
          source: 'assets',
          error: new Error(`Cesium 静态资源不可访问：${failed}`),
          detail:
            '请接入 @sgyx/cesium-kit-vite 插件，或手动复制 Workers/Assets/Widgets 并设置 cesiumBaseUrl'
        })
      }
    }

    this.scene.setLighting(options.enableLighting)
    this.scene.setDepthTestAgainstTerrain(options.depthTestAgainstTerrain)
    this.scene.setSkyAtmosphere(options.skyAtmosphere)
    this.scene.setFog(options.fog)
    if (options.requestRenderMode) {
      this.scene.setRequestRenderMode(true, options.maximumRenderTimeChange)
    }

    if (options.terrain !== 'ellipsoid') {
      try {
        await this.terrain.set(options.terrain)
      } catch (error) {
        this.log.error('地形加载失败', error)
        this.events.emit('error', {
          source: 'terrain',
          error,
          detail: 'terrain: "world" 需要有效的 Cesium ion token，或改用自定义 TerrainProvider'
        })
      }
    }

    if (options.imagery && options.imagery.length > 0) {
      for (const config of options.imagery) {
        try {
          await this.imagery.add(config.source, {
            id: config.id,
            show: config.show ?? true,
            alpha: config.alpha
          })
        } catch (error) {
          const detail =
            '请检查 Cesium 静态资源是否已复制、cesiumBaseUrl 是否正确（可接入 @sgyx/cesium-kit-vite 插件）'
          this.log.error(`底图 "${String(config.id ?? config.source)}" 加载失败。${detail}`, error)
          this.events.emit('error', { source: 'imagery', error, detail })
        }
      }
    }

    if (options.homeView) {
      this.camera.setView(options.homeView, {
        heading: options.homeOrientation?.heading,
        pitch: options.homeOrientation?.pitch,
        roll: options.homeOrientation?.roll
      })
    }

    this.events.emit('ready', this)
  }
}
