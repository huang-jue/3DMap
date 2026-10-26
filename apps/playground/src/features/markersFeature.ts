import {
  createLabel,
  createPoint,
  type CesiumFeature
} from '@sgyx/cesium-kit-core'

export interface MarkersFeatureOptions {
  cities?: Array<{ name: string; lon: number; lat: number }>
}

const DEFAULT_CITIES = [
  { name: '北京', lon: 116.3913, lat: 39.9075 },
  { name: '上海', lon: 121.4737, lat: 31.2304 },
  { name: '广州', lon: 113.2644, lat: 23.1291 },
  { name: '成都', lon: 104.0665, lat: 30.5728 }
]

/**
 * 示例插件：只使用 @sgyx/cesium-kit-core 的公开契约，
 * 用来验证 FeatureRegistry 的扩展能力与卸载回收。
 */
export const markersFeature: CesiumFeature<MarkersFeatureOptions> = {
  name: 'demo-markers',
  install(ctx, options) {
    const cities = options?.cities ?? DEFAULT_CITIES
    for (const city of cities) {
      ctx.layers.add(
        createPoint({
          id: `demo-marker-point-${city.name}`,
          position: { lon: city.lon, lat: city.lat, height: 0 },
          pixelSize: 10,
          color: '#67c23a',
          clampToGround: true
        })
      )
      ctx.layers.add(
        createLabel({
          id: `demo-marker-label-${city.name}`,
          position: { lon: city.lon, lat: city.lat, height: 0 },
          text: city.name,
          clampToGround: true,
          pixelOffset: [0, -14]
        })
      )
    }
  }
}
