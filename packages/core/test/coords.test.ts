import * as Cesium from 'cesium'
import { describe, expect, it } from 'vitest'
import { resolvePosition, resolvePositions, toCartesian, toDegrees, toRectangle } from '../src/coords'

describe('坐标转换', () => {
  it('经纬高与 Cartesian3 往返转换', () => {
    const cartesian = toCartesian(116.3913, 39.9075, 100)
    const result = toDegrees(cartesian)
    expect(result.lon).toBeCloseTo(116.3913, 6)
    expect(result.lat).toBeCloseTo(39.9075, 6)
    expect(result.height).toBeCloseTo(100, 3)
  })

  it('默认高度为 0', () => {
    const result = toDegrees(toCartesian(0, 0))
    expect(result.height).toBeCloseTo(0, 3)
  })

  it('resolvePosition 同时支持对象与 Cartesian3', () => {
    const fromObject = resolvePosition({ lon: 10, lat: 20, height: 5 })
    const fromCartesian = resolvePosition(fromObject)
    expect(Cesium.Cartesian3.equals(fromObject, fromCartesian)).toBe(true)
    expect(resolvePositions([fromObject, fromCartesian])).toHaveLength(2)
  })

  it('矩形范围转换', () => {
    const rectangle = toRectangle({ west: 100, south: 20, east: 110, north: 30 })
    expect(Cesium.Math.toDegrees(rectangle.west)).toBeCloseTo(100, 6)
    expect(Cesium.Math.toDegrees(rectangle.north)).toBeCloseTo(30, 6)
  })
})
