import { describe, expect, it } from 'vitest'
import {
  createLabel,
  createModel,
  createPoint,
  createPolygon,
  createPolyline
} from '../src/entity/factories'

describe('实体工厂', () => {
  it('创建点并应用默认样式', () => {
    const entity = createPoint({ position: { lon: 116.39, lat: 39.9, height: 50 } })
    expect(entity.id).toBeTruthy()
    expect(entity.point?.pixelSize?.getValue()).toBe(8)
    expect(entity.position).toBeTruthy()
  })

  it('创建标签并保留文本', () => {
    const entity = createLabel({
      position: { lon: 0, lat: 0 },
      text: '测试',
      pixelOffset: [2, -14]
    })
    expect(entity.label?.text?.getValue()).toBe('测试')
    expect(entity.label?.pixelOffset?.getValue()?.x).toBe(2)
    expect(entity.label?.pixelOffset?.getValue()?.y).toBe(-14)
  })

  it('创建折线/多边形', () => {
    const positions = [
      { lon: 0, lat: 0 },
      { lon: 1, lat: 0 },
      { lon: 1, lat: 1 }
    ]
    const polyline = createPolyline({ positions, width: 5 })
    expect(polyline.polyline?.width?.getValue()).toBe(5)

    const polygon = createPolygon({ positions, outline: true })
    const outline = polygon.polygon?.outline as unknown as { getValue(): boolean }
    expect(outline.getValue()).toBe(true)
  })

  it('创建模型并生成朝向四元数', () => {
    const entity = createModel({
      position: { lon: 120, lat: 30, height: 10 },
      uri: '/models/demo.glb',
      heading: 90
    })
    expect(entity.model?.uri?.getValue()).toBe('/models/demo.glb')
    expect(entity.orientation?.getValue()).toBeTruthy()
  })

  it('自定义 id 生效', () => {
    const entity = createPoint({ id: 'custom-point', position: { lon: 0, lat: 0 } })
    expect(entity.id).toBe('custom-point')
  })
})
