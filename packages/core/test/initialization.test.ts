import { describe, expect, it, vi } from 'vitest'
import { InitializationGate } from '../src/utils/InitializationGate'
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
describe('viewer initialization ownership', () => {
  it('shares a pending viewer and publishes exactly once', async () => {
    const request = deferred<object>()
    const create = vi.fn(() => request.promise),
      commit = vi.fn(),
      destroy = vi.fn()
    const gate = new InitializationGate(destroy)
    const first = gate.run(create, commit),
      second = gate.run(create, commit)
    expect(first).toBe(second)
    const viewer = {}
    request.resolve(viewer)
    expect(await first).toBe(viewer)
    expect(create).toHaveBeenCalledOnce()
    expect(commit).toHaveBeenCalledOnce()
    expect(destroy).not.toHaveBeenCalled()
  })
  it('destroys a late viewer after reset and permits a replacement initialization', async () => {
    const request = deferred<object>()
    const destroy = vi.fn(),
      oldCommit = vi.fn(),
      newCommit = vi.fn()
    const gate = new InitializationGate(destroy)
    const old = gate.run(() => request.promise, oldCommit)
    gate.cancel()
    const replacement = {}
    expect(await gate.run(async () => replacement, newCommit)).toBe(replacement)
    const late = {}
    request.resolve(late)
    expect(await old).toBeNull()
    expect(oldCommit).not.toHaveBeenCalled()
    expect(destroy).toHaveBeenCalledWith(late)
    expect(newCommit).toHaveBeenCalledWith(replacement)
  })
  it('ignores stale failures and releases a viewer when publication throws', async () => {
    const destroy = vi.fn(),
      gate = new InitializationGate(destroy),
      request = deferred<object>()
    const stale = gate.run(() => request.promise, vi.fn())
    gate.cancel()
    request.reject(new Error('late'))
    expect(await stale).toBeNull()
    const viewer = {}
    await expect(
      gate.run(
        async () => viewer,
        () => {
          throw new Error('commit')
        }
      )
    ).rejects.toThrow('commit')
    expect(destroy).toHaveBeenCalledWith(viewer)
  })
})
