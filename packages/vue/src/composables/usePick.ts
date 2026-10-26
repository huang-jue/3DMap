import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import type * as Cesium from 'cesium'
import type { CesiumViewerManager, PickEventPayload } from '@sgyx/cesium-kit-core'
import { useCesiumContext, whenReadySafe } from '../context'

export interface UsePickOptions {
  /** 是否监听 hover，默认 true */
  hover?: boolean
  /** hover 节流间隔（毫秒） */
  hoverInterval?: number
}

export interface UsePickReturn {
  /** 最近一次点击拾取结果 */
  last: Ref<PickEventPayload | null>
  /** 最近一次 hover 拾取结果 */
  hovered: Ref<PickEventPayload | null>
  pickAt(windowPosition?: Cesium.Cartesian2): Promise<PickEventPayload | null>
  setEnabled(enabled: boolean): Promise<void>
}

/** 点击 / 悬停拾取，返回经纬度、屏幕坐标与命中实体。 */
export function usePick(options: UsePickOptions = {}): UsePickReturn {
  const context = useCesiumContext()
  const last = ref<PickEventPayload | null>(null)
  const hovered = ref<PickEventPayload | null>(null)
  const disposers: Array<() => void> = []
  let unmounted = false

  const withManager = (): Promise<CesiumViewerManager | null> => whenReadySafe(context)

  onMounted(async () => {
    const manager = await withManager()
    if (!manager || unmounted) return

    if (options.hoverInterval !== undefined) {
      manager.pick.setHoverInterval(options.hoverInterval)
    }
    disposers.push(
      manager.pick.on('click', (payload) => {
        last.value = payload
      })
    )
    if (options.hover !== false) {
      disposers.push(
        manager.pick.on('hover', (payload) => {
          hovered.value = payload
        })
      )
    }
  })

  onBeforeUnmount(() => {
    unmounted = true
    disposers.forEach((dispose) => dispose())
    disposers.length = 0
  })

  return {
    last,
    hovered,
    async pickAt(windowPosition) {
      const manager = await withManager()
      return manager?.pick.pickAt(windowPosition) ?? null
    },
    async setEnabled(enabled) {
      const manager = await withManager()
      manager?.pick.setEnabled(enabled)
    }
  }
}
