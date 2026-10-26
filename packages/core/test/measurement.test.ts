import * as Cesium from 'cesium'
import { describe, expect, it } from 'vitest'
import {
  formatArea,
  formatDistance,
  formatHeight,
  getRectangleCorners,
  measureArea,
  measureCircle,
  measureDistance,
  measureHeight,
  measureRectangle,
  summarizeMeasurement
} from '../src/draw/measurement'

const BEIJING = { lon: 116.3913, lat: 39.9075 }
const SHANGHAI = { lon: 121.4737, lat: 31.2304 }

describe('量算工具', () => {
  it('计算两点测地线距离与高差', () => {
    const result = measureDistance([
      { ...BEIJING, height: 50 },
      { ...SHANGHAI, height: 120 }
    ])
    expect(result.segments).toHaveLength(1)
    expect(result.distance).toBeGreaterThan(1_050_000)
    expect(result.distance).toBeLessThan(1_100_000)
    expect(result.heightDiff).toBeCloseTo(70, 6)
  })

  it('支持三维直线距离', () => {
    const result = measureDistance(
      [
        { lon: 0, lat: 0, height: 0 },
        { lon: 0.01, lat: 0, height: 0 }
      ],
      { surface: false }
    )
    expect(result.distance).toBeGreaterThan(1100)
    expect(result.distance).toBeLessThan(1120)
  })

  it('计算小范围多边形面积与周长', () => {
    const positions = [
      { lon: 0, lat: 0 },
      { lon: 0.01, lat: 0 },
      { lon: 0.01, lat: 0.01 },
      { lon: 0, lat: 0.01 }
    ]
    const result = measureArea(positions)
    expect(result.area).toBeGreaterThan(1_200_000)
    expect(result.area).toBeLessThan(1_300_000)
    expect(result.perimeter).toBeGreaterThan(4400)
  })

  it('计算圆半径、面积与周长', () => {
    const result = measureCircle({ lon: 0, lat: 0 }, { lon: 0.01, lat: 0 })
    expect(result.radius).toBeGreaterThan(1100)
    expect(result.radius).toBeLessThan(1120)
    expect(result.area).toBeGreaterThan(3_800_000)
    expect(result.circumference).toBeGreaterThan(6900)
  })

  it('矩形按经纬度范围生成四角', () => {
    const corners = getRectangleCorners(
      { lon: 10, lat: 20 },
      { lon: 12, lat: 21 }
    )
    expect(corners).toHaveLength(4)
    const result = measureRectangle(
      { lon: 10, lat: 20 },
      { lon: 12, lat: 21 }
    )
    expect(result.width).toBeGreaterThan(170_000)
    expect(result.height).toBeGreaterThan(110_000)
    expect(result.area).toBeGreaterThan(20_000_000_000)
  })

  it('计算高差并为正值添加符号', () => {
    expect(measureHeight({ lon: 0, lat: 0, height: 10 }, { lon: 0, lat: 0, height: 25 })).toBe(15)
    expect(formatHeight(15)).toBe('+15 m')
    expect(formatHeight(-2)).toBe('-2 m')
  })

  it('格式化距离与面积', () => {
    expect(formatDistance(850)).toBe('850 m')
    expect(formatDistance(1250)).toBe('1.25 km')
    expect(formatArea(500)).toBe('500 m²')
    expect(formatArea(2_500_000)).toBe('2.5 km²')
  })

  it('按绘制类型汇总量算结果', () => {
    const line = [
      Cesium.Cartesian3.fromDegrees(0, 0, 0),
      Cesium.Cartesian3.fromDegrees(0.01, 0, 10)
    ]
    expect(summarizeMeasurement('polyline', line).distance).toBeGreaterThan(0)
    expect(summarizeMeasurement('height', line).heightDiff).toBeCloseTo(10, 6)

    const polygon = [
      Cesium.Cartesian3.fromDegrees(0, 0),
      Cesium.Cartesian3.fromDegrees(0.01, 0),
      Cesium.Cartesian3.fromDegrees(0.01, 0.01)
    ]
    expect(summarizeMeasurement('polygon', polygon).area).toBeGreaterThan(0)
  })
})
