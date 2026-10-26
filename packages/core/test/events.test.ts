import { describe, expect, it, vi } from 'vitest'
import { EventBus } from '../src/events/EventBus'

interface TestEvents {
  ping: number
  pong: string | undefined
}

describe('EventBus', () => {
  it('派发与订阅', () => {
    const bus = new EventBus<TestEvents>()
    const handler = vi.fn()
    bus.on('ping', handler)
    bus.emit('ping', 42)
    expect(handler).toHaveBeenCalledWith(42)
    expect(bus.listenerCount('ping')).toBe(1)
  })

  it('取消订阅后不再接收', () => {
    const bus = new EventBus<TestEvents>()
    const handler = vi.fn()
    const off = bus.on('ping', handler)
    off()
    bus.emit('ping', 1)
    expect(handler).not.toHaveBeenCalled()
    expect(bus.listenerCount('ping')).toBe(0)
  })

  it('once 只触发一次', () => {
    const bus = new EventBus<TestEvents>()
    const handler = vi.fn()
    bus.once('pong', handler)
    bus.emit('pong', 'a')
    bus.emit('pong', 'b')
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith('a')
  })

  it('clear 清空全部监听', () => {
    const bus = new EventBus<TestEvents>()
    bus.on('ping', () => undefined)
    bus.on('pong', () => undefined)
    bus.clear()
    expect(bus.listenerCount('ping')).toBe(0)
    expect(bus.listenerCount('pong')).toBe(0)
  })

  it('单个监听抛错不影响其他监听', () => {
    const onError = vi.fn()
    const bus = new EventBus<TestEvents>(onError)
    const second = vi.fn()
    bus.on('ping', () => {
      throw new Error('boom')
    })
    bus.on('ping', second)
    bus.emit('ping', 1)
    expect(second).toHaveBeenCalledWith(1)
    expect(onError).toHaveBeenCalledTimes(1)
  })
})
