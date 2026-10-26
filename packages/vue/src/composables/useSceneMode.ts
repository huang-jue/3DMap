import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import type { CesiumViewerManager, SceneModeName } from '@sgyx/cesium-kit-core'
import { useCesiumContext, whenReadySafe } from '../context'

export interface UseSceneModeReturn {
  mode: Ref<SceneModeName>
  setMode(mode: SceneModeName, duration?: number): Promise<void>
  getMode(): Promise<SceneModeName | null>
}

/** 3D / 2D / 哥伦布视图切换。 */
export function useSceneMode(): UseSceneModeReturn {
  const context = useCesiumContext()
  const mode = ref<SceneModeName>('3D')
  let stop: (() => void) | null = null
  const withManager = (): Promise<CesiumViewerManager | null> => whenReadySafe(context)

  onMounted(async () => {
    const manager = await withManager()
    if (!manager) return
    mode.value = manager.scene.getMode()
    stop = manager.events.on('scene:mode', (next) => {
      mode.value = next
    })
  })

  onBeforeUnmount(() => {
    stop?.()
    stop = null
  })

  return {
    mode,
    async setMode(next, duration) {
      const manager = await withManager()
      manager?.scene.setMode(next, duration)
    },
    async getMode() {
      const manager = await withManager()
      return manager?.scene.getMode() ?? null
    }
  }
}
