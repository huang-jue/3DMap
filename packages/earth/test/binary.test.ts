import { sharedDataRepository } from '@sgyx/cesium-kit-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadEarthScalarData } from '../src/data/loadEarthData'

afterEach(() => {
  vi.unstubAllGlobals()
  sharedDataRepository.clear()
})

describe('binary scalar loading', () => {
  const payload = {
    format: 'earth-scalar-f32-v1',
    legend: { min: 0, max: 7, unit: 'class', colors: ['#000', '#fff'] },
    frames: [
      {
        width: 2,
        height: 2,
        time: '2026-10-27T06:00Z',
        noData: -9999,
        bounds: { west: 0, south: 0, east: 1, north: 1 },
        binary: 'grid.f32'
      }
    ]
  }
  it('loads a relative Float32 frame, preserving numeric values and no-data', async () => {
    const bytes = new Float32Array([0, 2, -9999, 7]).buffer
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(payload)))
      .mockResolvedValueOnce(new Response(bytes))
    vi.stubGlobal('fetch', fetch)
    const result = await loadEarthScalarData('https://example.test/data/catalog.meta.json')
    expect(String(fetch.mock.calls[1]?.[0])).toBe('https://example.test/data/grid.f32')
    expect(result.frames[0]?.values).toEqual(new Float32Array([0, 2, -9999, 7]))
    expect(result.frames[0]?.noData).toBe(-9999)
  })
  it('rejects truncated frames before rendering', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(payload)))
        .mockResolvedValueOnce(new Response(new ArrayBuffer(4)))
    )
    await expect(loadEarthScalarData('/catalog.meta.json')).rejects.toThrow('length mismatch')
  })
})
