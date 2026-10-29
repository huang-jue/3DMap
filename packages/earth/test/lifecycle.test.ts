import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { FeatureContext } from '@sgyx/cesium-kit-core'
import { createEarthPlugin } from '../src/createEarthPlugin'
import type { EarthManifest } from '../src/shared/types'

const harness = vi.hoisted(() => ({
  delays: new Map<string, () => Promise<void>>(),
  annotations: [] as Array<{ id: string; visible: boolean; disposed: boolean }>,
  vectors: [] as string[]
}))
vi.mock('../src/features/createEarthScalarFeature', () => ({
  createEarthScalarFeature: (options: { overlay: { id: string } }) => ({
    install: () => harness.delays.get(options.overlay.id)?.(),
    dispose() {},
    setSettings() {},
    setFollowClock() {}
  })
}))
vi.mock('../src/features/createEarthVectorFeature', () => ({
  createEarthVectorFeature: (options: { vector: { id: string } }) => ({
    install() {
      harness.vectors.push(options.vector.id)
    },
    dispose() {},
    setSettings() {},
    setFollowClock() {}
  })
}))
vi.mock('../src/features/createEarthProbeFeature', () => ({
  createEarthProbeFeature: () => ({ install() {}, dispose() {} })
}))
vi.mock('../src/features/createEarthAnnotationFeature', () => ({
  createEarthAnnotationFeature: (options: { annotation: { id: string }; visible: boolean }) => {
    const state = { id: options.annotation.id, visible: options.visible, disposed: false }
    harness.annotations.push(state)
    return {
      annotation: options.annotation,
      install: () => harness.delays.get(state.id)?.(),
      setVisible(value: boolean) {
        state.visible = value
      },
      dispose() {
        state.disposed = true
      }
    }
  }
}))
function manifest(): EarthManifest {
  const bounds = { west: -180, south: -90, east: 180, north: 90 }
  return {
    range: { start: new Date('2026-01-01'), end: new Date('2026-01-02') },
    bounds,
    annotations: [{ id: 'fires', label: 'fires', type: 'points', data: '/fires' }],
    modes: [
      {
        id: 'atmosphere',
        label: 'air',
        vectors: [],
        overlays: [],
        defaultAnnotations: ['fires'],
        defaultLevel: 'surface',
        levels: ['surface', '500', '850'].map((id) => ({
          id,
          label: id,
          overlays: [
            {
              id: `scalar-${id}`,
              label: 'temperature',
              unit: 'C',
              min: 0,
              max: 1,
              colors: ['#000', '#fff'],
              data: id
            }
          ],
          vectors: [{ id: `vector-${id}`, label: 'wind', data: id, unit: 'm/s' }]
        }))
      }
    ]
  }
}
function context(): FeatureContext {
  return {
    viewer: { isDestroyed: () => false, scene: { requestRender() {} } },
    clock: { state: { currentTime: new Date('2026-01-01') } },
    log: { info() {}, warn() {} }
  } as unknown as FeatureContext
}
beforeEach(() => {
  harness.delays.clear()
  harness.annotations.length = 0
  harness.vectors.length = 0
})
describe('Earth lifecycle', () => {
  it('validates a saved state before changing the current mode or layers', async () => {
    const plugin = createEarthPlugin({
      data: manifest(),
      dataRef: 'sample',
      annotations: [],
      overlay: null,
      vector: null,
      syncClockRange: false
    })
    await plugin.install(context(), undefined)
    const saved = plugin.getState()
    await expect(plugin.restoreState({ ...saved, level: 'missing' })).rejects.toThrow('高度层')
    expect(plugin.level?.id).toBe('surface')
    await expect(
      plugin.restoreState({ ...saved, settings: { ...saved.settings, flowDensity: 100000 } })
    ).rejects.toThrow('flowDensity')
    expect(plugin.settings.flowDensity).toBe(saved.settings.flowDensity)
    plugin.dispose?.()
  })
  it('honors explicit empty annotations and merges duplicate in-flight toggles', async () => {
    const plugin = createEarthPlugin({
      data: manifest(),
      annotations: [],
      overlay: null,
      vector: null,
      syncClockRange: false
    })
    await plugin.install(context(), undefined)
    expect(harness.annotations).toHaveLength(0)
    let release!: () => void
    harness.delays.set(
      'fires',
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        })
    )
    const first = plugin.setAnnotation('fires', true)
    const second = plugin.setAnnotation('fires', true)
    await plugin.setAnnotation('fires', false)
    release()
    await Promise.all([first, second])
    expect(harness.annotations).toHaveLength(1)
    expect(harness.annotations[0]?.visible).toBe(false)
    plugin.dispose?.()
  })
  it('does not let a slow level install overwrite the latest vector', async () => {
    const plugin = createEarthPlugin({
      data: manifest(),
      annotations: [],
      overlay: null,
      vector: null,
      syncClockRange: false
    })
    await plugin.install(context(), undefined)
    let release!: () => void
    harness.delays.set(
      'scalar-500',
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        })
    )
    const old = plugin.setLevel('500')
    await plugin.setLevel('850')
    release()
    await old
    expect(plugin.level?.id).toBe('850')
    expect(plugin.vector?.id).toBe('vector-850')
    expect(harness.vectors).toEqual(['vector-850'])
    plugin.dispose?.()
  })
  it('disposes annotations that resolve after plugin destruction', async () => {
    const plugin = createEarthPlugin({
      data: manifest(),
      annotations: [],
      overlay: null,
      vector: null,
      syncClockRange: false
    })
    await plugin.install(context(), undefined)
    let release!: () => void
    harness.delays.set(
      'fires',
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        })
    )
    const pending = plugin.setAnnotation('fires', true)
    plugin.dispose?.()
    release()
    await pending
    expect(harness.annotations[0]?.disposed).toBe(true)
    expect(plugin.annotations).toEqual([])
    expect(plugin.errors).toEqual({})
  })
})
