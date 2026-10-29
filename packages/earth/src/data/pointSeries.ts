import type { DataRequestOptions } from '@sgyx/cesium-kit-core'
import { openWindSource, interpolateWind } from '@sgyx/cesium-kit-wind'
import { openEarthScalarSource } from './loadEarthData'
import { sampleRasterValue } from './time'
import type {
  EarthOverlayConfig,
  EarthVectorConfig,
  EarthInterpolation,
  EarthPointSeries
} from '../shared/types'

export async function samplePointSeries(
  lon: number,
  lat: number,
  level: string,
  overlay: EarthOverlayConfig | null,
  vector: EarthVectorConfig | null,
  interpolation: EarthInterpolation,
  options: DataRequestOptions = {}
): Promise<EarthPointSeries> {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90)
    throw new Error('非法点位坐标')
  const result: EarthPointSeries = { lon, lat, level, series: [] }
  if (overlay) {
    const source = await openEarthScalarSource(overlay.data, options)
    const points = []
    // Sequential frame sampling bounds memory and allows cancellation between frames.
    for (let i = 0; i < source.times.length; i++) {
      options.signal?.throwIfAborted()
      const frame = await source.getFrame(i, options)
      points.push({
        time: frame.time.toISOString(),
        value: sampleRasterValue(
          frame.values,
          frame.width,
          frame.height,
          frame.bounds,
          lon,
          lat,
          overlay.categories ? 'nearest' : interpolation,
          frame.noData
        )
      })
    }
    result.series.push({
      id: overlay.id,
      label: overlay.label,
      unit: overlay.unit,
      categories: overlay.categories,
      points
    })
  }
  if (vector) {
    const source = await openWindSource(vector.data, {}, options)
    const speed = [],
      direction = []
    for (let i = 0; i < source.times.length; i++) {
      options.signal?.throwIfAborted()
      const grid = await source.getFrame(i, options)
      const sample = interpolateWind(grid, lon, lat)
      const time = source.times[i]!.toISOString()
      speed.push({ time, value: sample?.speed ?? null })
      direction.push({ time, value: sample?.direction ?? null })
    }
    result.series.push(
      { id: `${vector.id}:speed`, label: vector.label, unit: vector.unit, points: speed },
      { id: `${vector.id}:direction`, label: `${vector.label}去向`, unit: '°', points: direction }
    )
  }
  return result
}

export function pointSeriesCsv(data: EarthPointSeries): string {
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
  const rows: unknown[][] = [
    ['longitude', 'latitude', 'variable', 'level', 'time_utc', 'value', 'unit']
  ]
  for (const series of data.series)
    for (const point of series.points)
      rows.push([
        data.lon,
        data.lat,
        series.label,
        data.level,
        point.time,
        point.value,
        series.unit
      ])
  return '\uFEFF' + rows.map((row) => row.map(escape).join(',')).join('\r\n')
}
