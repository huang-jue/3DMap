import * as Cesium from 'cesium'

export interface WmtsImageryOptions {
  url: string
  layer: string
  style?: string
  tileMatrixSetID: string
  tileMatrixLabels?: string[]
  format?: string
  tilingScheme?: Cesium.TilingScheme
  minimumLevel?: number
  maximumLevel?: number
  credit?: string
  subdomains?: string[]
  tileWidth?: number
  tileHeight?: number
}

/** 创建 WMTS 影像图层 provider，可直接传给 `imagery.add(...)`。 */
export function createWmtsImagery(
  options: WmtsImageryOptions
): Cesium.WebMapTileServiceImageryProvider {
  return new Cesium.WebMapTileServiceImageryProvider({
    url: options.url,
    layer: options.layer,
    style: options.style ?? 'default',
    tileMatrixSetID: options.tileMatrixSetID,
    tileMatrixLabels: options.tileMatrixLabels,
    format: options.format,
    tilingScheme: options.tilingScheme,
    minimumLevel: options.minimumLevel,
    maximumLevel: options.maximumLevel,
    credit: options.credit,
    subdomains: options.subdomains,
    tileWidth: options.tileWidth,
    tileHeight: options.tileHeight
  })
}
