import { computed, type ComputedRef, type ShallowRef } from 'vue'
import type * as Cesium from 'cesium'
import type { CesiumViewerManager } from ''
import { useCesiumContext } from '../context'

export interface UseViewerReturn {
  manager: ShallowRef<CesiumViewerManager | null>
  viewer: ComputedRef<Cesium.Viewer | null>
  ready: ComputedRef<boolean>
  error: ShallowRef<unknown>
  whenReady(): Promise<CesiumViewerManager>
  /** 同步获取 viewer，未就绪时抛错 */
  getViewer(): Cesium.Viewer
}

/** 获取当前 <CesiumViewer> 的视图与管理器。 */
export function useViewer(): UseViewerReturn {
  const context = useCesiumContext()
  const viewer = computed<Cesium.Viewer | null>(() => context.manager.value?.getViewer() ?? null)

  return {
    manager: context.manager,
    viewer,
    ready: context.ready,
    error: context.error,
    whenReady: context.whenReady,
    getViewer() {
      const instance = context.manager.value
      if (!instance) {
        throw new Error('[cesium-kit:vue] Viewer 尚未就绪，请先 await whenReady()')
      }
      return instance.getViewer()
    }
  }
}
