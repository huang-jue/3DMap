import * as Cesium from 'cesium'
import { describe, expect, it, vi } from 'vitest'
import { EventBus } from '../src/events/EventBus'
import { SceneService, type SceneViewBridge } from '../src/scene/SceneService'
import type { CameraView, CesiumKitEventMap } from '../src/types'

function view(lon: number): CameraView {
  return { lon, lat: 30, height: 1000, heading: 0, pitch: -90, roll: 0 }
}

function createHarness() {
  const morphComplete = new Cesium.Event()
  let mode: Cesium.SceneMode = Cesium.SceneMode.SCENE3D

  const scene = {
    get mode() {
      return mode
    },
    morphTime: 1,
    morphComplete,
    completeMorph: vi.fn(),
    morphTo2D: vi.fn(() => {
      mode = Cesium.SceneMode.SCENE2D
    }),
    morphTo3D: vi.fn(() => {
      mode = Cesium.SceneMode.SCENE3D
    }),
    morphToColumbusView: vi.fn(() => {
      mode = Cesium.SceneMode.COLUMBUS_VIEW
    }),
    globe: {
      enableLighting: false,
      depthTestAgainstTerrain: false,
      baseColor: null,
      show: true
    },
    fog: { enabled: true },
    skyAtmosphere: { show: true },
    skyBox: { show: true },
    sun: { show: true },
    moon: { show: true },
    canvas: { toDataURL: vi.fn(() => 'data:image/png;base64,QUJD') },
    requestRender: vi.fn()
  }

  const viewer = {
    scene,
    isDestroyed: () => false
  } as unknown as Cesium.Viewer

  const bridge: SceneViewBridge = {
    getView: vi.fn(() => view(1)),
    setView: vi.fn()
  }

  const events = new EventBus<CesiumKitEventMap>()
  const service = new SceneService(viewer, events, bridge)

  return { service, scene, bridge, morphComplete, events }
}

describe('SceneService', () => {
  it('切换投影会 morph 并派发事件', () => {
    const { service, scene, events } = createHarness()
    const listener = vi.fn()
    events.on('scene:mode', listener)

    service.setMode('2D', 1)

    expect(scene.morphTo2D).toHaveBeenCalledWith(1)
    expect(service.getMode()).toBe('2D')
    expect(listener).toHaveBeenCalledWith('2D')
  })

  it('morph 完成后回写切换前视角', () => {
    const { service, bridge, morphComplete } = createHarness()
    const captured = view(104)
    bridge.getView = vi.fn(() => captured)

    service.setMode('2D', 1)
    morphComplete.raiseEvent()

    expect(bridge.setView).toHaveBeenCalledTimes(1)
    expect(bridge.setView).toHaveBeenCalledWith(
      { lon: 104, lat: 30, height: 1000 },
      { heading: 0, pitch: -90, roll: 0 }
    )
  })

  it('连续切换只回写最后一次视角，且不残留监听', () => {
    const { service, bridge, morphComplete } = createHarness()
    const first = view(1)
    const second = view(2)
    bridge.getView = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second)

    service.setMode('2D', 1)
    service.setMode('3D', 1)

    expect(morphComplete.numberOfListeners).toBe(1)

    morphComplete.raiseEvent()

    expect(bridge.setView).toHaveBeenCalledTimes(1)
    expect(bridge.setView).toHaveBeenCalledWith(
      { lon: 2, lat: 30, height: 1000 },
      { heading: 0, pitch: -90, roll: 0 }
    )
    expect(morphComplete.numberOfListeners).toBe(0)
  })

  it('destroy 后不再回写，也不残留监听', () => {
    const { service, bridge, morphComplete } = createHarness()
    service.setMode('2D', 1)
    service.destroy()

    expect(morphComplete.numberOfListeners).toBe(0)
    morphComplete.raiseEvent()
    expect(bridge.setView).not.toHaveBeenCalled()
  })

  it('已处于目标模式时不重复 morph', () => {
    const { service, scene } = createHarness()
    service.setMode('3D', 1)
    expect(scene.morphTo3D).not.toHaveBeenCalled()
  })

  it('未知模式只告警不抛错', () => {
    const { service, scene } = createHarness()
    expect(() => service.setMode('BAD' as never, 1)).not.toThrow()
    expect(scene.morphTo2D).not.toHaveBeenCalled()
  })

  it('视觉开关作用于对应场景对象', () => {
    const { service, scene } = createHarness()

    service.setSkyBox(false)
    service.setSun(false)
    service.setMoon(false)
    service.setGlobeVisible(false)
    service.setSkyAtmosphere(false)
    service.setFog(false)
    service.setBaseColor('#102030')

    expect(scene.skyBox.show).toBe(false)
    expect(scene.sun.show).toBe(false)
    expect(scene.moon.show).toBe(false)
    expect(scene.globe.show).toBe(false)
    expect(scene.skyAtmosphere.show).toBe(false)
    expect(scene.fog.enabled).toBe(false)
    expect(scene.globe.baseColor).toBeTruthy()
  })

  it('未开启 preserveDrawingBuffer 时截图抛错', () => {
    const { service } = createHarness()
    expect(() => service.screenshot()).toThrow('preserveDrawingBuffer')
  })

  it('开启后可截图并返回 blob', () => {
    const { service } = createHarness()
    service.setPreserveDrawingBuffer(true)

    const result = service.screenshot()

    expect(result.dataUrl).toBe('data:image/png;base64,QUJD')
    expect(result.blob?.size).toBe(3)
  })
})
