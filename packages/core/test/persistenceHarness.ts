import * as Cesium from 'cesium'
import { vi } from 'vitest'
import { DataSourceManager } from '../src/datasource/DataSourceManager'
import { TilesetManager } from '../src/tileset/TilesetManager'
import { ImageryManager } from '../src/imagery/ImageryManager'
import { TerrainManager } from '../src/terrain/TerrainManager'
import { LayerManager } from '../src/layer/LayerManager'
import { ClockService } from '../src/clock/ClockService'
import { DrawService } from '../src/draw/DrawService'
import { SceneSnapshotService } from '../src/snapshot/SceneSnapshotService'
import { EventBus } from '../src/events/EventBus'
import { toDegrees } from '../src/coords'
import type { CoordService } from '../src/coords'
import type { CameraView, CesiumKitEventMap, SceneModeName } from '../src/types'
import type { CesiumViewerManager } from '../src/viewer/CesiumViewerManager'
import type { PickEventPayload, PickEventType } from '../src/pick/PickService'

export function createPersistenceHarness() {
  const events = new EventBus<CesiumKitEventMap>()
  const imagery: Cesium.ImageryLayer[] = []
  const viewer = {
    isDestroyed: () => false,
    entities: new Cesium.EntityCollection(),
    dataSources: new Cesium.DataSourceCollection(),
    clock: new Cesium.Clock(),
    scene: {
      primitives: new Cesium.PrimitiveCollection(),
      requestRender: vi.fn(),
      preRender: new Cesium.Event(),
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      canvas: document.createElement('canvas')
    },
    imageryLayers: {
      addImageryProvider: vi.fn(() => {
        const layer = { show: true, alpha: 1 } as Cesium.ImageryLayer
        imagery.push(layer)
        return layer
      }),
      remove: vi.fn((layer: Cesium.ImageryLayer) => {
        const index = imagery.indexOf(layer)
        if (index >= 0) imagery.splice(index, 1)
      }),
      raiseToTop: vi.fn()
    },
    flyTo: vi.fn(async () => true)
  } as unknown as Cesium.Viewer
  let enabled = true
  const handlers = new Map<PickEventType, (payload: PickEventPayload) => void>()
  let miss: (type: PickEventType) => void = () => {}
  const pick = {
    on: (type: PickEventType, handler: (payload: PickEventPayload) => void) => {
      handlers.set(type, handler)
      return () => handlers.delete(type)
    },
    onMiss: (handler: typeof miss) => {
      miss = handler
      return () => {
        miss = () => {}
      }
    },
    isEnabled: () => enabled,
    setEnabled: (value: boolean) => {
      enabled = value
    }
  }
  const loader = vi.fn(async () => new Cesium.CustomDataSource('test') as Cesium.GeoJsonDataSource)
  const tileFactory = vi.fn(async () => {
    let destroyed = false
    return {
      show: true,
      maximumScreenSpaceError: 16,
      style: undefined,
      isDestroyed: () => destroyed,
      destroy: () => {
        destroyed = true
      }
    } as unknown as Cesium.Cesium3DTileset
  })
  const dataSources = new DataSourceManager(viewer, { geojson: loader }, undefined, events)
  const tilesets = new TilesetManager(viewer, tileFactory, undefined, events)
  const imageryManager = new ImageryManager(viewer, events, {
    local: { id: 'local', label: 'local', create: () => ({}) as Cesium.ImageryProvider }
  })
  const terrain = new TerrainManager(viewer)
  const layerManager = new LayerManager({
    viewer,
    imagery: imageryManager,
    dataSources,
    tilesets,
    events
  })
  const clock = new ClockService(viewer, events)
  const draw = new DrawService(viewer, { toDegrees } as CoordService, {
    events,
    pick,
    createHandler: () => ({ setInputAction: () => {}, destroy: () => {} })
  })
  let view: CameraView = { lon: 10, lat: 20, height: 1000, heading: 0, pitch: -90, roll: 0 }
  let mode: SceneModeName = '3D'
  const camera = {
    getView: () => ({ ...view }),
    setView: (value: CameraView) => {
      view = { ...value }
    }
  }
  const scene = {
    getMode: () => mode,
    setMode: (value: SceneModeName) => {
      mode = value
    },
    requestRender: () => viewer.scene.requestRender()
  }
  const manager = {
    viewer,
    events,
    dataSources,
    tilesets,
    imagery: imageryManager,
    terrain,
    layerManager,
    clock,
    draw,
    pick,
    camera,
    scene,
    isDestroyed: () => false
  } as unknown as CesiumViewerManager
  const snapshots = new SceneSnapshotService(manager)
  const dispose = () => {
    snapshots.destroy()
    draw.destroy()
    layerManager.destroy()
    dataSources.destroy()
    tilesets.destroy()
    imageryManager.destroy()
    terrain.destroy()
    clock.destroy()
  }
  const payload = (
    entity?: Cesium.Entity,
    feature?: Cesium.Cesium3DTileFeature
  ): PickEventPayload => ({
    position: Cesium.Cartesian3.fromDegrees(10, 20),
    lonLatHeight: { lon: 10, lat: 20 },
    screen: { x: 1, y: 2 },
    entity,
    feature
  })
  return {
    manager,
    snapshots,
    loader,
    tileFactory,
    dispose,
    handlers,
    miss: (type: PickEventType) => miss(type),
    payload
  }
}
