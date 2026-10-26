import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import type { CameraTarget, CameraView, FlyToOptions } from '@cesium-kit/core'
import { useCesiumContext, whenReadySafe } from '../context'

export interface UseCameraOptions {
  /** 是否自动跟踪相机变化，默认 true */
  track?: boolean
}

export interface UseCameraReturn {
  view: Ref<CameraView | null>
  flyTo(target: CameraTarget, options?: FlyToOptions): Promise<void>
  flyHome(duration?: number): Promise<void>
  setView(target: CameraTarget, options?: FlyToOptions): Promise<void>
  getView(): Promise<CameraView | null>
}

/** 相机视角与飞行控制。 */
export function useCamera(options: UseCameraOptions = {}): UseCameraReturn {
  const context = useCesiumContext()
  const view = ref<CameraView | null>(null)
  const track = options.track ?? true
  let stop: (() => void) | null = null

  const withManager = () => whenReadySafe(context)

  if (track) {
    onMounted(async () => {
      const manager = await withManager()
      if (!manager) return
      view.value = manager.camera.getView()
      stop = manager.camera.onChange((next) => {
        view.value = next
      })
    })

    onBeforeUnmount(() => {
      stop?.()
      stop = null
    })
  }

  return {
    view,
    async flyTo(target, flyOptions) {
      const manager = await withManager()
      manager?.camera.flyTo(target, flyOptions)
    },
    async flyHome(duration) {
      const manager = await withManager()
      manager?.camera.flyHome(duration)
    },
    async setView(target, flyOptions) {
      const manager = await withManager()
      manager?.camera.setView(target, flyOptions)
    },
    async getView() {
      const manager = await withManager()
      return manager?.camera.getView() ?? null
    }
  }
}
