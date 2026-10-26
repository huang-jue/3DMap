import * as Cesium from 'cesium'
import { describe, expect, it, vi } from 'vitest'
import { CameraService, createHomeView } from '../src/camera/CameraService'
import { EventBus } from '../src/events/EventBus'
import type { CesiumKitEventMap } from '../src/types'

function createHarness(options?: {
  heading?: number
  pitch?: number
  roll?: number
  cartographic?: Cesium.Cartographic | null
  home?: ReturnType<typeof createHomeView> | null
}) {
  const changed = new Cesium.Event()
  const cartographic =
    options?.cartographic === null
      ? undefined
      : (options?.cartographic ??
        new Cesium.Cartographic(
          Cesium.Math.toRadians(116),
          Cesium.Math.toRadians(39),
          500
        ))
  const camera = {
    positionCartographic: cartographic,
    heading: options?.heading,
    pitch: options?.pitch,
    roll: options?.roll,
    percentageChanged: 0.01,
    changed,
    flyTo: vi.fn(),
    setView: vi.fn()
  }
  const viewer = {
    camera,
    scene: {
      screenSpaceCameraController: {
        minimumZoomDistance: 1,
        maximumZoomDistance: Infinity,
        enableCollisionDetection: true
      }
    },
    isDestroyed: () => false
  } as unknown as Cesium.Viewer
  const events = new EventBus<CesiumKitEventMap>()
  const service = new CameraService(
    viewer,
    events,
    { percentageChanged: 0.02 },
    options?.home === undefined ? createHomeView() : options.home
  )

  return { service, camera, changed, events, viewer }
}

describe('CameraService', () => {
  it('getView 返回角度制视角', () => {
    const { service } = createHarness({
      heading: Math.PI / 2,
      pitch: -Math.PI / 2,
      roll: 0
    })

    const view = service.getView()

    expect(view.lon).toBeCloseTo(116, 5)
    expect(view.lat).toBeCloseTo(39, 5)
    expect(view.height).toBeCloseTo(500, 5)
    expect(view.heading).toBeCloseTo(90, 5)
    expect(view.pitch).toBeCloseTo(-90, 5)
  })

  it('角度缺失时回退为 0 而不是抛错', () => {
    const { service } = createHarness({
      heading: undefined,
      pitch: undefined,
      roll: undefined,
      cartographic: null
    })

    expect(service.getView()).toEqual({
      lon: 0,
      lat: 0,
      height: 0,
      heading: 0,
      pitch: 0,
      roll: 0
    })
  })

  it('flyTo 将角度制转换为弧度', () => {
    const { service, camera } = createHarness()

    service.flyTo({ lon: 104, lat: 30, height: 1000 }, { heading: 90, pitch: -45, roll: 10 })

    const args = camera.flyTo.mock.calls[0][0]
    expect(args.duration).toBe(1.5)
    expect(args.orientation.heading).toBeCloseTo(Math.PI / 2, 6)
    expect(args.orientation.pitch).toBeCloseTo(-Math.PI / 4, 6)
    expect(args.orientation.roll).toBeCloseTo(Math.PI / 18, 6)
  })

  it('setView 立即定位并派发 camera:change', () => {
    const { service, camera, events } = createHarness()
    const listener = vi.fn()
    events.on('camera:change', listener)

    service.setView({ lon: 104, lat: 30, height: 1000 })

    expect(camera.setView).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledOnce()
  })

  it('home 为 null 时 flyHome 不执行', () => {
    const { service, camera } = createHarness({ home: null })
    expect(service.hasHome()).toBe(false)

    service.flyHome()

    expect(camera.flyTo).not.toHaveBeenCalled()
  })

  it('相机变化事件驱动 camera:change', () => {
    const { service, changed, events } = createHarness()
    const listener = vi.fn()
    service.onChange(listener)

    changed.raiseEvent()

    expect(listener).toHaveBeenCalledOnce()
    expect(events.listenerCount('camera:change')).toBe(1)
  })

  it('setTracking(false) 会移除监听', () => {
    const { service, camera } = createHarness()
    expect(camera.changed.numberOfListeners).toBe(2)

    service.setTracking(false)
    expect(camera.changed.numberOfListeners).toBe(1)

    service.setTracking(true, 0.05)
    expect(camera.changed.numberOfListeners).toBe(2)
    expect(camera.percentageChanged).toBe(0.05)
  })

  it('destroy 幂等', () => {
    const { service, camera } = createHarness()

    service.destroy()
    service.destroy()

    expect(camera.changed.numberOfListeners).toBe(0)
  })

  it('setConstraints 映射高度到缩放距离', () => {
    const { service, viewer } = createHarness()
    const controller = viewer.scene.screenSpaceCameraController

    service.setConstraints({ minHeight: 100, maxHeight: 20000000 })

    expect(controller.minimumZoomDistance).toBe(100)
    expect(controller.maximumZoomDistance).toBe(20000000)
    expect(service.getConstraints()).toEqual({ minHeight: 100, maxHeight: 20000000 })
  })

  it('俯仰超出约束时回写相机', () => {
    const { service, camera } = createHarness({ pitch: Math.PI / 6 })

    service.setConstraints({ maxPitch: 0 })

    expect(camera.setView).toHaveBeenCalledOnce()
    const args = camera.setView.mock.calls[0][0]
    expect(args.orientation.pitch).toBeCloseTo(0, 6)
  })

  it('setCollisionDetection 切换碰撞检测', () => {
    const { service, viewer } = createHarness()
    service.setCollisionDetection(false)
    expect(viewer.scene.screenSpaceCameraController.enableCollisionDetection).toBe(false)
  })

  it('分享链接可生成并还原', () => {
    const { service, camera } = createHarness()

    const url = service.getShareUrl('https://example.com/app')
    expect(url).toBe('https://example.com/app#map=116,39,500,0,0,0')

    expect(service.applyFromUrl('#map=104,30,1000,0,-45,0')).toBe(true)
    expect(camera.setView).toHaveBeenCalledOnce()

    expect(service.applyFromUrl('not-a-state')).toBe(false)
  })
})
