import * as Cesium from 'cesium'
import { describe, expect, it, vi } from 'vitest'
import {
  PickService,
  type PickEventHandlerLike,
  type PickEventPayload
} from '../src/pick/PickService'

const target = Cesium.Cartesian3.fromDegrees(116.3913, 39.9075, 0)

function createHarness() {
  const actions = new Map<number, (event: unknown) => void>()
  const destroy = vi.fn()
  const handler: PickEventHandlerLike = {
    setInputAction: (action, type) => {
      actions.set(type, action)
    },
    destroy,
    isDestroyed: () => false
  }

  const scene = {
    mode: Cesium.SceneMode.SCENE2D,
    canvas: { clientWidth: 800, clientHeight: 600, width: 800, height: 600 },
    pickPositionSupported: false,
    pick: vi.fn(() => undefined),
    globe: {
      ellipsoid: Cesium.Ellipsoid.WGS84,
      pick: vi.fn(() => undefined)
    }
  }
  const viewer = {
    scene,
    camera: {
      pickEllipsoid: vi.fn(() => target),
      getPickRay: vi.fn(() => ({}) as Cesium.Ray)
    },
    clock: { currentTime: Cesium.JulianDate.now() },
    isDestroyed: () => false
  } as unknown as Cesium.Viewer

  const service = new PickService(viewer, { createHandler: () => handler })
  return { service, handler, actions, viewer, scene }
}

describe('PickService', () => {
  it('click 事件派发经纬度与屏幕坐标', () => {
    const { service, actions } = createHarness()
    const received: PickEventPayload[] = []
    service.on('click', (payload) => received.push(payload))

    actions.get(Cesium.ScreenSpaceEventType.LEFT_CLICK)?.({ position: new Cesium.Cartesian2(5, 6) })

    expect(received).toHaveLength(1)
    expect(received[0]?.lonLatHeight.lon).toBeCloseTo(116.3913, 5)
    expect(received[0]?.screen).toEqual({ x: 5, y: 6 })
  })

  it('hover 事件按间隔节流', () => {
    const { service, actions } = createHarness()
    const received: PickEventPayload[] = []
    service.setHoverInterval(1000)
    service.on('hover', (payload) => received.push(payload))

    const move = actions.get(Cesium.ScreenSpaceEventType.MOUSE_MOVE)
    move?.({ endPosition: new Cesium.Cartesian2(1, 1) })
    move?.({ endPosition: new Cesium.Cartesian2(2, 2) })

    expect(received).toHaveLength(1)
  })

  it('setEnabled(false) 后不再派发', () => {
    const { service, actions } = createHarness()
    const listener = vi.fn()
    service.on('click', listener)
    service.setEnabled(false)

    actions.get(Cesium.ScreenSpaceEventType.LEFT_CLICK)?.({ position: new Cesium.Cartesian2(5, 6) })

    expect(listener).not.toHaveBeenCalled()
  })

  it('off 可移除监听', () => {
    const { service, actions } = createHarness()
    const listener = vi.fn()
    service.on('click', listener)
    service.off('click', listener)

    actions.get(Cesium.ScreenSpaceEventType.LEFT_CLICK)?.({ position: new Cesium.Cartesian2(5, 6) })

    expect(listener).not.toHaveBeenCalled()
  })

  it('pickAt 返回拾取结果', () => {
    const { service } = createHarness()
    const result = service.pickAt(new Cesium.Cartesian2(1, 1))
    expect(result?.lonLatHeight.lon).toBeCloseTo(116.3913, 5)
  })

  it('destroy 后不再拾取且销毁处理器', () => {
    const { service, handler, actions } = createHarness()
    service.destroy()

    expect(handler.destroy).toHaveBeenCalledOnce()
    expect(service.pickAt()).toBeUndefined()
    expect(actions.size).toBe(2)
  })
})
