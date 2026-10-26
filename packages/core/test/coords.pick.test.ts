import * as Cesium from 'cesium'
import { describe, expect, it, vi } from 'vitest'
import { pickPosition } from '../src/coords'

const target = Cesium.Cartesian3.fromDegrees(116.3913, 39.9075, 100)

interface PickScenario {
  mode: Cesium.SceneMode
  pickPositionSupported?: boolean
  scenePick?: Cesium.Cartesian3
  globePick?: Cesium.Cartesian3
  ellipsoidPick?: Cesium.Cartesian3
  destroyed?: boolean
}

function createViewer(scenario: PickScenario) {
  const scene = {
    mode: scenario.mode,
    pickPositionSupported: scenario.pickPositionSupported ?? true,
    canvas: { clientWidth: 800, clientHeight: 600, width: 800, height: 600 },
    globe: {
      ellipsoid: Cesium.Ellipsoid.WGS84,
      pick: vi.fn(() => scenario.globePick)
    },
    pickPosition: vi.fn(() => scenario.scenePick)
  }
  const camera = {
    getPickRay: vi.fn(() => ({}) as Cesium.Ray),
    pickEllipsoid: vi.fn(() => scenario.ellipsoidPick)
  }
  return {
    viewer: {
      scene,
      camera,
      isDestroyed: () => scenario.destroyed ?? false
    } as unknown as Cesium.Viewer,
    scene,
    camera
  }
}

describe('pickPosition', () => {
  it('3D 优先使用深度拾取', () => {
    const { viewer, scene } = createViewer({
      mode: Cesium.SceneMode.SCENE3D,
      pickPositionSupported: true,
      scenePick: target
    })

    const result = pickPosition(viewer, new Cesium.Cartesian2(10, 10))

    expect(scene.pickPosition).toHaveBeenCalledOnce()
    expect(result?.source).toBe('scene')
    expect(result?.lonLatHeight.lon).toBeCloseTo(116.3913, 5)
    expect(result?.lonLatHeight.lat).toBeCloseTo(39.9075, 5)
  })

  it('3D 深度拾取失败时回退到射线求交', () => {
    const { viewer, scene } = createViewer({
      mode: Cesium.SceneMode.SCENE3D,
      globePick: target
    })

    const result = pickPosition(viewer)

    expect(scene.globe.pick).toHaveBeenCalledOnce()
    expect(result?.source).toBe('ray')
  })

  it('2D 使用 pickEllipsoid（globe.pick 在 2D 不可用）', () => {
    const { viewer, scene, camera } = createViewer({
      mode: Cesium.SceneMode.SCENE2D,
      ellipsoidPick: target
    })

    const result = pickPosition(viewer)

    expect(scene.pickPosition).not.toHaveBeenCalled()
    expect(scene.globe.pick).not.toHaveBeenCalled()
    expect(camera.pickEllipsoid).toHaveBeenCalledOnce()
    expect(result?.source).toBe('ellipsoid')
    expect(result?.lonLatHeight.lon).toBeCloseTo(116.3913, 5)
  })

  it('2D 椭球拾取失败返回 undefined', () => {
    const { viewer } = createViewer({ mode: Cesium.SceneMode.SCENE2D })
    expect(pickPosition(viewer)).toBeUndefined()
  })

  it('已销毁的 Viewer 返回 undefined', () => {
    const { viewer } = createViewer({ mode: Cesium.SceneMode.SCENE3D, destroyed: true })
    expect(pickPosition(viewer)).toBeUndefined()
  })
})
