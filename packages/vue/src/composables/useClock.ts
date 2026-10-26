import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import type { ClockState, CesiumViewerManager } from '@sgyx/cesium-kit-core'
import { useCesiumContext, whenReadySafe } from '../context'

export interface UseClockReturn {
  /** 当前时间轴状态 */
  state: Ref<ClockState | null>
  play(): Promise<void>
  pause(): Promise<void>
  toggle(): Promise<void>
  seek(time: Date | string): Promise<void>
  setMultiplier(multiplier: number): Promise<void>
  setStep(seconds: number): Promise<void>
  stepForward(): Promise<void>
  stepBackward(): Promise<void>
  /** 订阅帧驱动，返回取消订阅函数 */
  onTick(handler: (state: ClockState) => void): Promise<() => void>
}

/** 时间轴状态与控制（0.2.0 起 FeatureContext.clock 同源）。 */
export function useClock(): UseClockReturn {
  const context = useCesiumContext()
  const state = ref<ClockState | null>(null)
  let stopState: (() => void) | null = null

  const withManager = (): Promise<CesiumViewerManager | null> => whenReadySafe(context)

  onMounted(async () => {
    const manager = await withManager()
    if (!manager) return
    state.value = manager.clock.state
    stopState = manager.clock.onStateChange((next) => {
      state.value = next
    })
  })

  onBeforeUnmount(() => {
    stopState?.()
    stopState = null
  })

  return {
    state,
    async play() {
      ;(await withManager())?.clock.play()
    },
    async pause() {
      ;(await withManager())?.clock.pause()
    },
    async toggle() {
      ;(await withManager())?.clock.toggle()
    },
    async seek(time) {
      ;(await withManager())?.clock.seek(time)
    },
    async setMultiplier(multiplier) {
      ;(await withManager())?.clock.setMultiplier(multiplier)
    },
    async setStep(seconds) {
      ;(await withManager())?.clock.setStep(seconds)
    },
    async stepForward() {
      ;(await withManager())?.clock.stepForward()
    },
    async stepBackward() {
      ;(await withManager())?.clock.stepBackward()
    },
    async onTick(handler) {
      const manager = await withManager()
      if (!manager) return () => undefined
      return manager.clock.onTick(handler)
    }
  }
}
