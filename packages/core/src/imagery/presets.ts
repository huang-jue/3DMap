import * as Cesium from 'cesium'

export type ImageryProviderFactory = () => Cesium.ImageryProvider | Promise<Cesium.ImageryProvider>

export interface ImageryPreset {
  id: string
  label: string
  create: ImageryProviderFactory
}

/**
 * 内置底图预设。`naturalEarth` 依赖 Cesium 静态资源（Assets/Textures/NaturalEarthII），
 * 请确认 `cesiumBaseUrl` 或 `@sgyx/cesium-kit-vite` 插件已正确配置。
 */
export const imageryPresets: Record<string, ImageryPreset> = {
  naturalEarth: {
    id: 'naturalEarth',
    label: '自然地球',
    create: () =>
      Cesium.TileMapServiceImageryProvider.fromUrl(
        Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII')
      )
  },
  osm: {
    id: 'osm',
    label: 'OpenStreetMap',
    create: () => new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' })
  },
  arcgis: {
    id: 'arcgis',
    label: 'ArcGIS 影像',
    create: () =>
      Cesium.ArcGisMapServerImageryProvider.fromUrl(
        'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
      )
  }
}

export interface XyzImageryOptions {
  minimumLevel?: number
  maximumLevel?: number
  credit?: string
}

/** 用 `{z}/{x}/{y}` 模板快速创建自定义瓦片底图。 */
export function createXyzImagery(
  url: string,
  options: XyzImageryOptions = {}
): Cesium.UrlTemplateImageryProvider {
  return new Cesium.UrlTemplateImageryProvider({
    url,
    minimumLevel: options.minimumLevel ?? 0,
    maximumLevel: options.maximumLevel,
    credit: options.credit
  })
}
