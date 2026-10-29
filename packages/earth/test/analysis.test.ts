import { afterEach, describe, expect, it, vi } from 'vitest'
import { sharedDataRepository } from '@sgyx/cesium-kit-core'
import { openEarthScalarSource } from '../src/data/loadEarthData'
import { pointSeriesCsv, samplePointSeries } from '../src/data/pointSeries'
import { paintRows } from '../src/layers/rasterPixels'

afterEach(() => {
  vi.unstubAllGlobals()
  sharedDataRepository.clear()
})
describe('lazy frames and point analysis', () => {
  it('reads only the requested binary frame and reuses parsed cache', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.endsWith('json')
        ? new Response(
            JSON.stringify({
              format: 'earth-scalar-f32-v1',
              legend: { min: 0, max: 1, unit: 'C' },
              frames: Array.from({ length: 24 }, (_, i) => ({
                width: 2,
                height: 2,
                time: new Date(Date.UTC(2026, 0, 1, i)).toISOString(),
                bounds: { west: 0, south: 0, east: 1, north: 1 },
                binary: `frame-${i}.f32`
              }))
            })
          )
        : new Response(new Float32Array([1, 2, 3, 4]).buffer)
    )
    vi.stubGlobal('fetch', fetch)
    const source = await openEarthScalarSource('https://example.test/lazy.json')
    expect(fetch).toHaveBeenCalledTimes(1)
    const frame = await source.getFrame(7)
    expect(frame.time.toISOString()).toBe('2026-01-01T07:00:00.000Z')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(await source.getFrame(7)).toBe(frame)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('preserves no-data and categories in a point series and escapes CSV', async () => {
    const bounds = { west: 0, south: 0, east: 1, north: 1 }
    const input = {
      legend: { min: 0, max: 2, unit: 'class' },
      frames: [
        {
          width: 2,
          height: 2,
          bounds,
          values: [-9999, 1, 1, 2],
          noData: -9999,
          time: '2026-01-01T00:00Z'
        },
        { width: 2, height: 2, bounds, values: [2, 1, 1, 2], time: '2026-01-01T01:00Z' }
      ]
    }
    const result = await samplePointSeries(
      0,
      0,
      'surface',
      {
        id: 'x',
        label: 'a,"b',
        unit: 'class',
        min: 0,
        max: 2,
        colors: ['#000', '#fff'],
        categories: ['low', 'medium', 'high'],
        data: JSON.stringify(input)
      },
      null,
      'bilinear'
    )
    expect(result.series[0]?.points.map((item) => item.value)).toEqual([null, 2])
    const csv = pointSeriesCsv(result)
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('"a,""b"')
    expect(csv).toContain('2026-01-01T00:00:00.000Z')
    expect(result.series[0]?.categories).toEqual(['low', 'medium', 'high'])
  })
  it('paints matching transparent no-data pixels in row batches', () => {
    const colors = new Uint8ClampedArray(4096 * 4)
    colors.fill(255)
    const pixels = new Uint8ClampedArray(16)
    const job = {
      width: 2,
      height: 2,
      targetWidth: 2,
      targetHeight: 2,
      values: [-9999, 1, 2, 3],
      noData: -9999,
      colors,
      min: 0,
      max: 3,
      log: false,
      smooth: false
    }
    paintRows(job, pixels, 0, 1)
    paintRows(job, pixels, 1, 2)
    expect(pixels[11]).toBe(0)
    expect(pixels[3]).toBe(255)
    expect(pixels[15]).toBe(255)
  })
})
