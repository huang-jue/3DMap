import * as Cesium from 'cesium'

export interface WmsImageryOptions {
  url: string
  /** 逗号分隔的图层名 */
  layers: string
  /** 追加的 WMS 参数，例如 { styles: 'default' } */
  parameters?: Record<string, string>
  format?: string
  transparent?: boolean
  version?: string
  crs?: string
  minimumLevel?: number
  maximumLevel?: number
  credit?: string
  tileWidth?: number
  tileHeight?: number
  tilingScheme?: Cesium.TilingScheme
}

/** 创建 WMS 影像图层 provider，可直接传给 `imagery.add(...)`。 */
export function createWmsImagery(
  options: WmsImageryOptions
): Cesium.WebMapServiceImageryProvider {
  const { layers, ...rest } = options
  return new Cesium.WebMapServiceImageryProvider({
    ...rest,
    layers,
    parameters: {
      ...options.parameters
    }
  })
}
