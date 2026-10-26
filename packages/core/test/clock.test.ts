import * as Cesium from 'cesium'
import { describe, expect, it, vi } from 'vitest'
import { ClockService } from '../src/clock/ClockService'
import { EventBus } from '../src/events/EventBus'
import type { CesiumKitEventMap } from '../src/types'

function createHarness() {
  const clock = new Cesium.Clock({ shouldAnimate: false })
  const viewer = {
    clock,
    isDestroyed: () => false
  } as unknown as Cesium.Viewer
  const events = new EventBus<CesiumKitEventMap>()
  const service = new ClockService(viewer, events)
  return { service, clock, events }
}

describe('ClockService', () => {
  it('播放、暂停与切换', () => {
    const { service, clock, events } = createHarness()
    const listener = vi.fn()
    events.on('clock:state', listener)

    service.play()
    expect(clock.shouldAnimate).toBe(true)

    service.pause()
    expect(clock.shouldAnimate).toBe(false)

    service.toggle()
    expect(clock.shouldAnimate).toBe(true)
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('设置倍速并忽略非法值', () => {
    const { service, clock } = createHarness()

    service.setMultiplier(120)
    expect(clock.multiplier).toBe(120)

    service.setMultiplier(0)
    expect(clock.multiplier).toBe(120)
  })

  it('跳转到指定时间', () => {
    const { service } = createHarness()
    const target = new Date('2026-01-01T00:00:00Z')

    service.seek(target)
    expect(service.state.currentTime.toISOString()).toBe(target.toISOString())

    service.seek('2026-02-01T00:00:00Z')
    expect(service.state.currentTime.toISOString()).toBe('2026-02-01T00:00:00.000Z')
  })

  it('设置时间范围与循环', () => {
    const { service } = createHarness()
    service.setRange(new Date('2026-01-01T00:00:00Z'), new Date('2026-01-02T00:00:00Z'))

    const state = service.state
    expect(state.startTime?.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(state.stopTime?.toISOString()).toBe('2026-01-02T00:00:00.000Z')
    expect(state.loop).toBe(false)

    service.loop(true)
    expect(service.state.loop).toBe(true)
  })

  it('按步长前后跳转', () => {
    const { service } = createHarness()
    service.seek('2026-01-01T00:00:00Z')
    service.setStep(30)

    service.stepForward()
    expect(service.state.currentTime.toISOString()).toBe('2026-01-01T00:00:30.000Z')

    service.stepBackward()
    service.stepBackward()
    expect(service.state.currentTime.toISOString()).toBe('2025-12-31T23:59:30.000Z')
  })

  it('onTick 随 Cesium clock 帧驱动', () => {
    const { service, clock } = createHarness()
    const handler = vi.fn()
    const off = service.onTick(handler)

    clock.tick()
    expect(handler).toHaveBeenCalledOnce()

    off()
    clock.tick()
    expect(handler).toHaveBeenCalledOnce()
  })

  it('destroy 后不再派发 tick', () => {
    const { service, clock } = createHarness()
    const handler = vi.fn()
    service.onTick(handler)
    service.destroy()

    clock.tick()
    expect(handler).not.toHaveBeenCalled()
    expect(clock.onTick.numberOfListeners).toBe(0)
  })
})
