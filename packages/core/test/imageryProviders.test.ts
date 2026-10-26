import { describe, expect, it } from 'vitest'
import { createWmsImagery } from '../src/imagery/wms'
import { createWmtsImagery } from '../src/imagery/wmts'

describe('WMS / WMTS', () => {
  it('WMS 映射 url / layers / 层级', () => {
    const provider = createWmsImagery({
      url: 'https://example.com/geoserver/wms',
      layers: 'workspace:roads,workspace:rivers',
      parameters: { styles: 'line' },
      transparent: true,
      format: 'image/png',
      version: '1.3.0',
      minimumLevel: 2,
      maximumLevel: 16
    })

    expect(provider.url).toContain('geoserver/wms')
    expect(provider.layers).toBe('workspace:roads,workspace:rivers')
    expect(provider.minimumLevel).toBe(2)
    expect(provider.maximumLevel).toBe(16)
    expect(provider.tileWidth).toBe(256)
  })

  it('WMS 支持自定义瓦片尺寸', () => {
    const provider = createWmsImagery({
      url: 'https://example.com/wms',
      layers: 'a',
      tileWidth: 512,
      tileHeight: 512
    })

    expect(provider.tileWidth).toBe(512)
    expect(provider.tileHeight).toBe(512)
  })

  it('WMTS 映射 url / format / 层级', () => {
    const provider = createWmtsImagery({
      url: 'https://example.com/wmts',
      layer: 'img',
      style: 'default',
      tileMatrixSetID: 'EPSG:3857',
      format: 'image/jpeg',
      maximumLevel: 18,
      subdomains: ['a', 'b']
    })

    expect(provider.url).toContain('example.com/wmts')
    expect(provider.format).toBe('image/jpeg')
    expect(provider.maximumLevel).toBe(18)
  })

  it('WMTS 默认 style 为 default（不抛错）', () => {
    expect(() =>
      createWmtsImagery({
        url: 'https://example.com/wmts',
        layer: 'img',
        tileMatrixSetID: 'EPSG:4326'
      })
    ).not.toThrow()
  })
})
