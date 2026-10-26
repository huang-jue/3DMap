import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import type { CesiumViewerManager, ImageryLayerInfo, ImagerySource } from '@cesium-kit/core'
import { useCesiumContext, whenReadySafe } from '../context'

export interface UseImageryReturn {
  layers: Ref<ImageryLayerInfo[]>
  active: Ref<string | null>
  refresh(): Promise<void>
  add(source: ImagerySource, options?: { id?: string; show?: boolean; alpha?: number }): Promise<void>
  switchTo(id: string | null): Promise<void>
  remove(id: string): Promise<void>
  setAlpha(id: string, alpha: number): Promise<void>
  setShow(id: string, show: boolean): Promise<void>
}

/** 底图读写与响应式图层列表。 */
export function useImagery(): UseImageryReturn {
  const context = useCesiumContext()
  const layers = ref<ImageryLayerInfo[]>([])
  const active = ref<string | null>(null)
  let stop: (() => void) | null = null

  const withManager = (): Promise<CesiumViewerManager | null> => whenReadySafe(context)

  const exec = async (fn: (manager: CesiumViewerManager) => void): Promise<void> => {
    const manager = await withManager()
    if (manager) fn(manager)
  }

  const refresh = async (): Promise<void> => {
    const manager = await withManager()
    if (!manager) return
    layers.value = manager.imagery.list()
    active.value = manager.imagery.active
  }

  onMounted(async () => {
    const manager = await withManager()
    if (!manager) return
    layers.value = manager.imagery.list()
    active.value = manager.imagery.active
    stop = manager.events.on('imagery:change', ({ id }) => {
      if (manager.isDestroyed()) return
      active.value = id
      layers.value = manager.imagery.list()
    })
    const stopUpdate = manager.events.on('imagery:update', () => {
      if (manager.isDestroyed()) return
      layers.value = manager.imagery.list()
    })
    const previousStop = stop
    stop = () => {
      previousStop?.()
      stopUpdate()
    }
  })

  onBeforeUnmount(() => {
    stop?.()
    stop = null
  })

  return {
    layers,
    active,
    refresh,
    async add(source, options) {
      const manager = await withManager()
      if (!manager) return
      await manager.imagery.add(source, options)
      layers.value = manager.imagery.list()
    },
    async switchTo(id) {
      await exec((manager) => manager.imagery.switchTo(id))
    },
    async remove(id) {
      await exec((manager) => manager.imagery.remove(id))
    },
    async setAlpha(id, alpha) {
      await exec((manager) => manager.imagery.setAlpha(id, alpha))
    },
    async setShow(id, show) {
      await exec((manager) => manager.imagery.setShow(id, show))
    }
  }
}
