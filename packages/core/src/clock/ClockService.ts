import * as Cesium from 'cesium'
import type { EventBus } from '../events/EventBus'
import type { CesiumKitEventMap, ClockState } from '../types'
import { createLogger, type Logger } from '../utils/logger'

export interface ClockOptions {
  startTime?: Date | Cesium.JulianDate
  stopTime?: Date | Cesium.JulianDate
  currentTime?: Date | Cesium.JulianDate
  /** 时间倍速，默认 1 */
  multiplier?: number
  /** 是否自动播放，默认 false */
  shouldAnimate?: boolean
  /** 到达 stopTime 后循环，默认 false */
  loop?: boolean
  /** 单步时长（秒），供 stepForward/stepBackward 使用，默认 60 */
  step?: number
}

function toJulian(value: Date | Cesium.JulianDate): Cesium.JulianDate {
  return value instanceof Cesium.JulianDate ? value : Cesium.JulianDate.fromDate(value)
}

function toDate(value: Cesium.JulianDate): Date {
  return Cesium.JulianDate.toDate(value)
}

/**
 * 时间轴服务：统一 play/pause/seek/倍速/循环与帧驱动，
 * 业务插件（如洪水演进）只订阅 onTick 即可，不需要自己起定时器。
 */
export class ClockService {
  private log: Logger
  private destroyed = false
  private step: number
  private tickHandlers = new Set<(state: ClockState) => void>()
  private readonly handleTick = (): void => {
    const state = this.getState()
    this.events.emit('clock:tick', { currentTime: state.currentTime })
    this.tickHandlers.forEach((handler) => handler(state))
  }

  constructor(
    private readonly viewer: Cesium.Viewer,
    private readonly events: EventBus<CesiumKitEventMap>,
    options: ClockOptions = {},
    logger?: Logger
  ) {
    this.log = logger ?? createLogger('clock')
    this.step = options.step ?? 60
    const clock = this.viewer.clock

    if (options.startTime) clock.startTime = toJulian(options.startTime)
    if (options.stopTime) clock.stopTime = toJulian(options.stopTime)
    if (options.currentTime) clock.currentTime = toJulian(options.currentTime)
    if (options.multiplier !== undefined) clock.multiplier = options.multiplier
    if (options.shouldAnimate !== undefined) clock.shouldAnimate = options.shouldAnimate
    if (options.loop !== undefined) {
      clock.clockRange = options.loop ? Cesium.ClockRange.LOOP_STOP : Cesium.ClockRange.CLAMPED
    }

    clock.onTick.addEventListener(this.handleTick)
  }

  /** Cesium 原生 Clock，用于需要底层能力（如时间格式化）的场景。 */
  get raw(): Cesium.Clock {
    return this.viewer.clock
  }

  get state(): ClockState {
    return this.getState()
  }

  getState(): ClockState {
    const clock = this.viewer.clock
    const useRange = !Cesium.JulianDate.equals(clock.startTime, clock.stopTime)
    return {
      currentTime: toDate(clock.currentTime),
      startTime: useRange ? toDate(clock.startTime) : null,
      stopTime: useRange ? toDate(clock.stopTime) : null,
      multiplier: clock.multiplier,
      running: clock.shouldAnimate,
      loop: clock.clockRange === Cesium.ClockRange.LOOP_STOP
    }
  }

  play(): void {
    this.viewer.clock.shouldAnimate = true
    this.emitState()
  }

  pause(): void {
    this.viewer.clock.shouldAnimate = false
    this.emitState()
  }

  toggle(): void {
    this.viewer.clock.shouldAnimate = !this.viewer.clock.shouldAnimate
    this.emitState()
  }

  setMultiplier(multiplier: number): void {
    if (!Number.isFinite(multiplier) || multiplier === 0) {
      this.log.warn(`忽略非法倍速：${multiplier}`)
      return
    }
    this.viewer.clock.multiplier = multiplier
    this.emitState()
  }

  /** 设置时间范围；传 null 表示清除范围限制。 */
  setRange(start: Date | Cesium.JulianDate, stop: Date | Cesium.JulianDate): void {
    const clock = this.viewer.clock
    clock.startTime = toJulian(start)
    clock.stopTime = toJulian(stop)
    this.emitState()
  }

  clearRange(): void {
    const clock = this.viewer.clock
    clock.startTime = Cesium.JulianDate.clone(clock.currentTime)
    clock.stopTime = Cesium.JulianDate.clone(clock.currentTime)
    this.emitState()
  }

  loop(enabled: boolean): void {
    this.viewer.clock.clockRange = enabled
      ? Cesium.ClockRange.LOOP_STOP
      : Cesium.ClockRange.CLAMPED
    this.emitState()
  }

  seek(time: Date | string | Cesium.JulianDate): void {
    const julian =
      typeof time === 'string'
        ? Cesium.JulianDate.fromIso8601(time)
        : time instanceof Date
          ? Cesium.JulianDate.fromDate(time)
          : time
    this.viewer.clock.currentTime = julian
    this.emitState()
  }

  setStep(seconds: number): void {
    if (seconds <= 0) return
    this.step = seconds
  }

  getStep(): number {
    return this.step
  }

  /** 按步长前后跳转，便于逐帧查看。 */
  stepForward(): void {
    this.shift(this.step)
  }

  stepBackward(): void {
    this.shift(-this.step)
  }

  onTick(handler: (state: ClockState) => void): () => void {
    this.tickHandlers.add(handler)
    return () => this.tickHandlers.delete(handler)
  }

  onStateChange(handler: (state: ClockState) => void): () => void {
    return this.events.on('clock:state', handler)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.tickHandlers.clear()
    if (!this.viewer.isDestroyed()) {
      this.viewer.clock.onTick.removeEventListener(this.handleTick)
    }
  }

  private shift(seconds: number): void {
    const clock = this.viewer.clock
    const next = Cesium.JulianDate.addSeconds(
      clock.currentTime,
      seconds,
      new Cesium.JulianDate()
    )
    clock.currentTime = Cesium.JulianDate.clone(next)
    this.emitState()
  }

  private emitState(): void {
    if (this.destroyed) return
    this.events.emit('clock:state', this.getState())
  }
}
