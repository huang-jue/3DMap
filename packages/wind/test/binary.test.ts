import { sharedDataRepository } from '@sgyx/cesium-kit-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadWindGrids } from '../src/data/loadWind'

afterEach(() => {
  vi.unstubAllGlobals()
  sharedDataRepository.clear()
})
describe('binary vector loading', () => {
  const payload = {
    format: 'wind-f32-v1',
    width: 2,
    height: 2,
    binary: 'ocean.f32',
    refTime: '2026-10-27T06:00Z',
    bounds: { west: 0, south: 0, east: 1, north: 1 }
  }
  it('loads U/V views and preserves land as NaN', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(payload)))
      .mockResolvedValueOnce(new Response(new Float32Array([NaN, 1, 2, 3, NaN, 4, 5, 6]).buffer))
    vi.stubGlobal('fetch', fetch)
    const [grid] = await loadWindGrids('https://example.test/data/ocean.meta.json')
    expect(String(fetch.mock.calls[1]?.[0])).toBe('https://example.test/data/ocean.f32')
    expect(Number.isNaN(grid!.u[0])).toBe(true)
    expect(Array.from(grid!.v).slice(1)).toEqual([4, 5, 6])
    expect(grid!.refTime?.toISOString()).toBe('2026-10-27T06:00:00.000Z')
  })
  it('rejects a truncated pair of vector components', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(payload)))
        .mockResolvedValueOnce(new Response(new ArrayBuffer(16)))
    )
    await expect(loadWindGrids('/ocean.meta.json')).rejects.toThrow('长度不匹配')
  })
  it('loads multiple forecast frames without changing their valid times', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            format: 'wind-f32-series-v1',
            frames: [payload, { ...payload, refTime: '2026-10-27T09:00Z' }]
          })
        )
      )
      .mockImplementation(
        async () => new Response(new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer)
      )
    vi.stubGlobal('fetch', fetch)
    const grids = await loadWindGrids('/wind.meta.json')
    expect(grids.map((grid) => grid.refTime?.toISOString())).toEqual([
      '2026-10-27T06:00:00.000Z',
      '2026-10-27T09:00:00.000Z'
    ])
    expect(grids[1]!.v[3]).toBe(8)
  })
})
