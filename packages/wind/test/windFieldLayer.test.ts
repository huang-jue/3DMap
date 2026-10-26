import * as Cesium from 'cesium'
import { describe, expect, it, vi } from 'vitest'
import { WindLayer } from 'cesium-wind-layer'
import { WindFieldLayer } from '../src/field/WindFieldLayer'
import type { WindGrid } from '../src/shared/types'

vi.mock('cesium-wind-layer', () => ({
  WindLayer: vi.fn(class {
    show = true
    updateOptions = vi.fn()
    destroy = vi.fn()
  })
}))

const grid: WindGrid = {
  width: 2,
  height: 2,
  bounds: { west: 100, south: 20, east: 110, north: 30 },
  u: [1, 2, 3, 4],
  v: [2, 3, 4, 5]
}

function createViewer() {
  return {
    camera: { changed: new Cesium.Event() },
    scene: {
      morphComplete: new Cesium.Event(),
      requestRenderMode: true,
      requestRender: vi.fn()
    },
    isDestroyed: () => false
  } as unknown as Cesium.Viewer
}

describe('WindFieldLayer', () => {
  it('keeps GPU defaults when feature options contain undefined values', () => {
    const viewer = createViewer()
    const layer = new WindFieldLayer(viewer, grid, {
      particlesTextureSize: undefined,
      dropRate: undefined,
      dropRateBump: undefined,
      lineLength: undefined,
      dynamic: undefined,
      colors: undefined
    })
    layer.add()

    expect(vi.mocked(WindLayer).mock.lastCall?.[2]).toMatchObject({
      particlesTextureSize: 96,
      dropRate: 0.002,
      dropRateBump: 0.0005,
      lineLength: { min: 60, max: 160 },
      dynamic: true,
      colors: ['#ffffff']
    })
    expect(viewer.scene.requestRenderMode).toBe(false)
    layer.destroy()
    expect(viewer.scene.requestRenderMode).toBe(true)
  })

  it('ignores undefined updates while preserving explicit false and zero', () => {
    const layer = new WindFieldLayer(createViewer(), grid, { speedFactor: 2 })
    layer.add()
    layer.updateOptions({ speedFactor: undefined, dynamic: false, dropRate: 0 })

    const rawLayer = vi.mocked(WindLayer).mock.results.at(-1)?.value as WindLayer
    expect(rawLayer.updateOptions).toHaveBeenLastCalledWith(expect.objectContaining({
      speedFactor: 2,
      dynamic: false,
      dropRate: 0
    }))
    layer.destroy()
  })
})
