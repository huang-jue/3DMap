import { describe, expect, it, vi } from 'vitest'
import { DataRepository } from '../src/data/DataRepository'

describe('DataRepository', () => {
  it('limits concurrent transfers and releases a queued cancellation without starving others', async () => {
    const repository = new DataRepository(128, 2)
    const releases: Array<() => void> = []
    let active = 0,
      peak = 0
    const fetch = vi.fn(async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise<void>((resolve) =>
        releases.push(() => {
          active--
          resolve()
        })
      )
      return new Response('ok')
    })
    vi.stubGlobal('fetch', fetch)
    try {
      const first = repository.request('/first'),
        second = repository.request('/second')
      const controller = new AbortController()
      const cancelled = repository.request('/cancelled', controller.signal)
      const rejection = expect(cancelled).rejects.toMatchObject({ name: 'AbortError' })
      const fourth = repository.request('/fourth')
      await Promise.resolve()
      controller.abort()
      await rejection
      expect(fetch).toHaveBeenCalledTimes(2)
      releases.shift()!()
      await first
      await Promise.resolve()
      expect(fetch).toHaveBeenCalledTimes(3)
      releases.shift()!()
      releases.shift()!()
      await Promise.all([second, fourth])
      expect(peak).toBe(2)
      expect(repository.stats.active).toBe(0)
    } finally {
      vi.unstubAllGlobals()
    }
  })
  it('deduplicates consumers without aborting the remaining consumer', async () => {
    const repository = new DataRepository(16)
    let release!: (value: Float32Array) => void
    let requests = 0
    let sharedSignal: AbortSignal | undefined
    const load = (signal: AbortSignal) => {
      requests++
      sharedSignal = signal
      return new Promise<Float32Array>((resolve) => {
        release = resolve
      })
    }
    const controller = new AbortController()
    const first = repository.load('a', load, { signal: controller.signal })
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    const second = repository.load('a', load)
    await Promise.resolve()
    controller.abort()
    expect(sharedSignal?.aborted).toBe(false)
    release(new Float32Array([1, 2]))
    await rejected
    expect(await second).toEqual(new Float32Array([1, 2]))
    expect(await repository.load('a', load)).toEqual(new Float32Array([1, 2]))
    expect(requests).toBe(1)
    expect(repository.loads[0]?.cacheHit).toBe(true)
  })
  it('aborts abandoned loads, evicts by bytes, and bypasses cache explicitly', async () => {
    const repository = new DataRepository(8)
    const controller = new AbortController()
    let sharedSignal: AbortSignal | undefined
    const pending = repository.load(
      'slow',
      (signal) => {
        sharedSignal = signal
        return new Promise(() => {})
      },
      { signal: controller.signal }
    )
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await Promise.resolve()
    controller.abort()
    await rejected
    expect(sharedSignal?.aborted).toBe(true)
    await repository.load('a', async () => new Float32Array([1, 2]))
    await repository.load('b', async () => new Float32Array([3, 4]))
    expect(repository.stats).toMatchObject({ bytes: 8, entries: 1 })
    let calls = 0
    await repository.load(
      'b',
      async () => {
        calls++
        return new Float32Array([5, 6])
      },
      { bypassCache: true }
    )
    expect(calls).toBe(1)
    expect(repository.stats.bytes).toBe(8)
  })
})
