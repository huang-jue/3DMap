import * as Cesium from 'cesium'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CoordService } from '../src/coords'
import { DrawService } from '../src/draw/DrawService'
import type { DrawEventHandlerLike } from '../src/draw/types'

function createHarness() {
  const actions = new Map<number, (event: unknown) => void>()
  const handler: DrawEventHandlerLike = {
    setInputAction: (action, type) => {
      actions.set(type, action)
    },
    destroy: vi.fn(),
    isDestroyed: () => false
  }
  const entities = new Map<string, Cesium.Entity>()
  const viewer = {
    entities: {
      add: (entity: Cesium.Entity) => {
        entities.set(entity.id, entity)
        return entity
      },
      remove: (entity: Cesium.Entity) => entities.delete(entity.id),
      removeById: (id: string) => entities.delete(id),
      getById: (id: string) => entities.get(id),
      values: []
    },
    scene: {
      canvas: { clientWidth: 800, clientHeight: 600, width: 800, height: 600 },
      requestRender: vi.fn(),
      pick: vi.fn(() => undefined),
      screenSpaceCameraController: { enableInputs: true }
    },
    isDestroyed: () => false
  } as unknown as Cesium.Viewer

  const coords = {
    pickPosition: vi.fn((screen?: Cesium.Cartesian2) => {
      const x = screen?.x ?? 0
      const y = screen?.y ?? 0
      return {
        position: Cesium.Cartesian3.fromDegrees(x, y),
        lonLatHeight: { lon: x, lat: y, height: 0 },
        source: 'scene' as const
      }
    }),
    toDegrees: (cartesian: Cesium.Cartesian3) => {
      const carto = Cesium.Cartographic.fromCartesian(cartesian)
      return {
        lon: Cesium.Math.toDegrees(carto?.longitude ?? 0),
        lat: Cesium.Math.toDegrees(carto?.latitude ?? 0),
        height: carto?.height ?? 0
      }
    }
  } as unknown as CoordService

  let pickEnabled = true
  const pick = {
    setEnabled: vi.fn((enabled: boolean) => {
      pickEnabled = enabled
    }),
    isEnabled: () => pickEnabled
  }

  let keyHandler: ((event: KeyboardEvent) => void) | undefined
  const keyboardTarget = {
    addEventListener: (_type: string, handler: (event: KeyboardEvent) => void) => {
      keyHandler = handler
    },
    removeEventListener: vi.fn()
  }

  const service = new DrawService(viewer, coords, {
    createHandler: () => handler,
    pick,
    keyboardTarget: keyboardTarget as unknown as Pick<
      Document,
      'addEventListener' | 'removeEventListener'
    >
  })

  const click = (x: number, y: number): void => {
    actions.get(Cesium.ScreenSpaceEventType.LEFT_CLICK)?.({
      position: new Cesium.Cartesian2(x, y)
    })
  }
  const move = (x: number, y: number): void => {
    actions.get(Cesium.ScreenSpaceEventType.MOUSE_MOVE)?.({
      endPosition: new Cesium.Cartesian2(x, y)
    })
  }
  const rightClick = (): void => {
    actions.get(Cesium.ScreenSpaceEventType.RIGHT_CLICK)?.({})
  }
  const doubleClick = (x: number, y: number): void => {
    actions.get(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK)?.({
      position: new Cesium.Cartesian2(x, y)
    })
  }
  const escape = (): void => {
    keyHandler?.({ key: 'Escape' } as KeyboardEvent)
  }

  return {
    actions,
    entities,
    viewer,
    coords,
    service,
    pick,
    click,
    move,
    rightClick,
    doubleClick,
    escape,
    isPickEnabled: () => pickEnabled
  }
}

describe('DrawService', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('点绘制单击完成并生成实体', () => {
    const { service, click, entities } = createHarness()
    const session = service.start('point', { editable: false })
    click(0.01, 0.01)

    expect(session.state).toBe('completed')
    expect(session.result?.positions).toHaveLength(1)
    expect(entities.size).toBe(1)
  })

  it('线绘制支持预览、右键结束与距离量算', () => {
    const { service, click, move, rightClick, entities } = createHarness()
    const session = service.start('polyline', {
      editable: false,
      measure: { distance: true }
    })
    click(0.01, 0.01)
    move(0.02, 0.01)
    click(0.02, 0.01)
    rightClick()

    expect(session.state).toBe('completed')
    expect(session.result?.positions).toHaveLength(2)
    expect(session.result?.measurement.distance).toBeGreaterThan(0)
    expect(entities.size).toBe(2)
  })

  it('面绘制双击结束并计算面积', () => {
    const { service, click, doubleClick } = createHarness()
    const session = service.start('polygon', { editable: false })
    click(0.01, 0.01)
    click(0.02, 0.01)
    click(0.02, 0.02)
    click(0.02, 0.02)
    doubleClick(0.02, 0.02)

    expect(session.state).toBe('completed')
    expect(session.result?.positions).toHaveLength(3)
    expect(session.result?.measurement.area).toBeGreaterThan(0)
  })

  it('矩形与圆两次点击完成', () => {
    const { service, click } = createHarness()
    const rectangle = service.start('rectangle', { editable: false })
    click(0.01, 0.01)
    click(0.02, 0.02)
    expect(rectangle.state).toBe('completed')
    expect(rectangle.result?.positions).toHaveLength(4)
    expect(rectangle.result?.measurement.area).toBeGreaterThan(0)

    const circle = service.start('circle', { editable: false })
    click(0.01, 0.01)
    click(0.02, 0.01)
    expect(circle.state).toBe('completed')
    expect(circle.result?.measurement.radius).toBeGreaterThan(0)
  })

  it('Esc 取消绘制并清理实体', () => {
    const { service, click, escape, entities, isPickEnabled } = createHarness()
    const session = service.start('polyline')
    click(0.01, 0.01)
    expect(entities.size).toBe(1)
    expect(isPickEnabled()).toBe(false)

    escape()
    expect(session.state).toBe('cancelled')
    expect(service.sessionList).toHaveLength(0)
    expect(entities.size).toBe(0)
  })

  it('完成后可拖拽顶点编辑', () => {
    const { service, click, rightClick, entities, viewer, actions } = createHarness()
    const session = service.start('polyline', { editable: true })
    click(0.01, 0.01)
    click(0.02, 0.02)
    rightClick()

    const handle = entities.get(`${session.id}-handle-0`)
    expect(handle).toBeTruthy()
    const before = (session.positions[0] as Cesium.Cartesian3).clone()

    ;(viewer.scene.pick as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      id: handle
    })
    actions.get(Cesium.ScreenSpaceEventType.LEFT_DOWN)?.({
      position: new Cesium.Cartesian2(0.01, 0.01)
    })
    actions.get(Cesium.ScreenSpaceEventType.MOUSE_MOVE)?.({
      endPosition: new Cesium.Cartesian2(0.05, 0.05)
    })
    actions.get(Cesium.ScreenSpaceEventType.LEFT_UP)?.({})

    const after = session.positions[0] as Cesium.Cartesian3
    expect(Cesium.Cartesian3.distance(before, after)).toBeGreaterThan(1000)
    expect(session.result?.measurement.distance).toBeGreaterThan(0)
  })

  it('destroy 清理所有实体与处理器', () => {
    const { service, click, entities } = createHarness()
    service.start('point', { editable: false })
    click(0.01, 0.01)
    expect(entities.size).toBe(1)
    service.destroy()
    expect(entities.size).toBe(0)
  })
})

describe('Draw GeoJSON persistence', () => {
  it.each(['point', 'polyline', 'polygon', 'rectangle', 'circle', 'height'] as const)(
    'round-trips %s with styles, editability and measurement',
    (type) => {
      const { service, click, rightClick } = createHarness()
      const session = service.start(type, {
        name: 'saved',
        editable: true,
        style: { lineColor: '#ff0000', dashed: true },
        measure: { decimals: 3, segmentLabels: true }
      })
      click(10, 20)
      if (type !== 'point') click(10.1, 20.1)
      if (type === 'polygon') click(10.2, 20)
      rightClick()
      const expected = session.result!.measurement
      const exported = service.exportGeoJSON()
      const originalId = session.id
      service.clear()
      const [restored] = service.importGeoJSON(JSON.stringify(exported))
      expect(restored!.id).not.toBe(originalId)
      expect(restored!.type).toBe(type)
      expect(restored!.editable).toBe(true)
      for (const [key, value] of Object.entries(expected)) {
        expect(restored!.result!.measurement[key as keyof typeof expected]).toBeCloseTo(value!, 4)
      }
      const again = service.exportGeoJSON()
      expect(again.features[0]!.geometry.type).toBe(exported.features[0]!.geometry.type)
      const metadata = again.features[0]!.properties!.cesiumKit as { style: { lineColor: string } }
      expect(metadata.style.lineColor).toBe('rgb(255,0,0)')
      restored!.updateVertex(0, { lon: 11, lat: 21 })
      expect(restored!.result!.positions.some((point) => Math.abs(point.lon - 11) < 0.00001)).toBe(
        true
      )
      service.destroy()
    }
  )

  it('validates the entire collection before changing existing results or active drawing', () => {
    const { service, click } = createHarness()
    const session = service.start('point')
    click(10, 20)
    const valid = service.exportGeoJSON().features[0]!
    const active = service.start('polyline')
    click(1, 2)
    const count = service.sessionList.length
    expect(() =>
      service.importGeoJSON({
        type: 'FeatureCollection',
        features: [valid, { ...valid, geometry: { type: 'MultiPoint', coordinates: [] } }]
      })
    ).toThrow('不支持')
    expect(service.sessionList).toHaveLength(count)
    expect(session.state).toBe('completed')
    expect(active.state).toBe('drawing')
    service.destroy()
  })

  it('rejects holes, non-finite coordinates and bad metadata; retains multiple editable results', () => {
    const { service } = createHarness()
    const feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [10, 20] },
      properties: null
    }
    const collection = (features: unknown[]) => ({ type: 'FeatureCollection', features })
    expect(() =>
      service.importGeoJSON(
        collection([{ ...feature, geometry: { type: 'Point', coordinates: [NaN, 20] } }])
      )
    ).toThrow()
    expect(() =>
      service.importGeoJSON(
        collection([{ ...feature, geometry: { type: 'Polygon', coordinates: [[], []] } }])
      )
    ).toThrow('无孔')
    expect(() =>
      service.importGeoJSON(
        collection([{ ...feature, properties: { cesiumKit: { version: 99 } } }])
      )
    ).toThrow('版本')
    const sessions = service.importGeoJSON(collection([feature, feature]))
    expect(sessions.map((item) => item.editable)).toEqual([true, true])
    expect(new Set(sessions.map((item) => item.id)).size).toBe(2)
    service.destroy()
  })
})
