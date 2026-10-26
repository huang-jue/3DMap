import { describe, expect, it, vi } from 'vitest'
import { createWeatherPlugin } from '../src/createWeatherPlugin'
import type { WeatherRasterFeatureOptions } from '../src/features/createWeatherRasterFeature'

vi.mock('../src/features/createWeatherRasterFeature', () => ({
  createWeatherRasterFeature: (options: WeatherRasterFeatureOptions) => ({
    kind: options.kind,
    name: options.name ?? `weather-${options.kind}`,
    frames: [
      {
        time: new Date('2026-07-01T00:00:00Z'),
        bounds: { west: 0, south: 0, east: 1, north: 1 },
        width: 2,
        height: 2,
        values: [0, 0, 0, 0]
      }
    ],
    install: vi.fn(async () => {
      if (options.kind === 'radar') throw new Error('radar failed')
    }),
    dispose: vi.fn(),
    setVisible: vi.fn(),
    setAlpha: vi.fn(),
    setFollowClock: vi.fn(),
    setTime: vi.fn(),
    setTimeRange: vi.fn(),
    getTimeRange: vi.fn(() => null),
    getAvailableRange: vi.fn(() => null),
    getCurrentFrame: vi.fn(() => null),
    getValueAt: vi.fn(() => null),
    zoomTo: vi.fn(),
    updateData: vi.fn(async () => {}),
    refresh: vi.fn(async () => {})
  })
}))

function createContext() {
  return {
    clock: {
      state: { currentTime: new Date('2026-07-01T00:00:00Z') },
      setRange: vi.fn(),
      seek: vi.fn()
    },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  }
}

const base: WeatherRasterFeatureOptions = {
  kind: 'precip',
  data: 'unused'
}

describe('createWeatherPlugin', () => {
  it('continueOnError 隔离单图层失败', async () => {
    const onLayerError = vi.fn()
    const plugin = createWeatherPlugin({
      layers: [base, { kind: 'radar', data: 'unused' }],
      continueOnError: true,
      onLayerError
    })
    const ctx = createContext()

    await plugin.install(ctx as never, {} as never)
    expect(Object.keys(plugin.layers)).toEqual(['precip'])
    expect(plugin.errors.radar).toBeInstanceOf(Error)
    expect(onLayerError).toHaveBeenCalledWith('radar', expect.any(Error))
  })

  it('lazy 模式在首次显示时加载图层', async () => {
    const onLayerLoaded = vi.fn()
    const plugin = createWeatherPlugin({
      layers: [
        { ...base, visible: true },
        { kind: 'temperature', data: 'unused', visible: false }
      ],
      lazy: true,
      onLayerLoaded
    })
    const ctx = createContext()

    await plugin.install(ctx as never, {} as never)
    expect(Object.keys(plugin.layers)).toEqual(['precip'])
    expect(onLayerLoaded).toHaveBeenCalledWith('precip')

    await plugin.setLayerVisible('temperature', true)
    expect(Object.keys(plugin.layers)).toEqual(['precip', 'temperature'])
    expect(onLayerLoaded).toHaveBeenCalledWith('temperature')
  })

  it('时间范围会按图层可用范围钳制', async () => {
    const plugin = createWeatherPlugin({ layers: [base] })
    const ctx = createContext()
    await plugin.install(ctx as never, {} as never)

    plugin.setTimeRange(new Date('2026-06-01T00:00:00Z'), new Date('2026-06-02T00:00:00Z'))
    expect(plugin.getTimeRange()?.start.toISOString()).toBe('2026-07-01T00:00:00.000Z')
    expect(plugin.getTimeRange()?.end.toISOString()).toBe('2026-07-01T00:00:00.000Z')
  })
})
