import * as Cesium from 'cesium'
import { sharedDataRepository, type DataRequestOptions } from '@sgyx/cesium-kit-core'

/** Raster coastlines give geographic context without thousands of pickable entities. */
export async function loadEarthCoastline(url: string, options: DataRequestOptions = {}): Promise<Cesium.SingleTileImageryProvider> {
  const lines = await sharedDataRepository.json(url, options) as number[][][]
  if (!Array.isArray(lines)) throw new Error('Invalid coastline')
  const canvas = document.createElement('canvas')
  canvas.width = 2048
  canvas.height = 1024
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Coastline Canvas 2D unavailable')
  context.strokeStyle = 'rgba(220,239,238,0.68)'
  context.lineWidth = 1.2
  context.beginPath()
  for (const line of lines) {
    let previous: number[] | undefined
    for (const point of line) {
      const x = ((point[0]! + 180) / 360) * canvas.width
      const y = ((90 - point[1]!) / 180) * canvas.height
      if (!previous || Math.abs(previous[0]! - point[0]!) > 180) context.moveTo(x, y)
      else context.lineTo(x, y)
      previous = point
    }
  }
  context.stroke()
  return new Cesium.SingleTileImageryProvider({
    url: canvas.toDataURL('image/png'),
    tileWidth: canvas.width,
    tileHeight: canvas.height,
    rectangle: Cesium.Rectangle.MAX_VALUE
  })
}
