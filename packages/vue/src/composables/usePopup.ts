import { onBeforeUnmount, ref, type Ref } from 'vue'
import type { CesiumViewerManager, PopupHandle, PopupOptions } from '@sgyx/cesium-kit-core'
import { useCesiumContext, whenReadySafe } from '../context'

export interface UsePopupReturn {
  popups: Ref<PopupHandle[]>
  open(options: PopupOptions): Promise<PopupHandle | null>
  close(id: string): Promise<void>
  closeAll(): Promise<void>
}

export function usePopup(): UsePopupReturn {
  const context = useCesiumContext()
  const popups = ref<PopupHandle[]>([])
  const openedIds = new Set<string>()
  let manager: CesiumViewerManager | null = null
  let unmounted = false

  const getManager = async (): Promise<CesiumViewerManager | null> => {
    manager = manager ?? (await whenReadySafe(context))
    return manager
  }

  onBeforeUnmount(() => {
    unmounted = true
    if (manager) {
      openedIds.forEach((id) => manager?.popup.close(id))
    }
    openedIds.clear()
    popups.value = []
    manager = null
  })

  return {
    popups,
    async open(options) {
      const instance = await getManager()
      if (!instance || unmounted) return null
      const handle = instance.popup.open(options)
      const wrapped: PopupHandle = {
        get id() {
          return handle.id
        },
        get element() {
          return handle.element
        },
        get isOpen() {
          return handle.isOpen
        },
        setPosition: (position) => handle.setPosition(position),
        setContent: (content) => handle.setContent(content),
        setTitle: (title) => handle.setTitle(title),
        close: () => {
          openedIds.delete(handle.id)
          popups.value = popups.value.filter((item) => item.id !== handle.id)
          handle.close()
        }
      }
      openedIds.add(handle.id)
      popups.value = [...popups.value.filter((item) => item.id !== handle.id), wrapped]
      return wrapped
    },
    async close(id) {
      const instance = await getManager()
      if (!instance) return
      instance.popup.close(id)
      openedIds.delete(id)
      popups.value = popups.value.filter((handle) => handle.id !== id)
    },
    async closeAll() {
      const instance = await getManager()
      if (!instance) return
      openedIds.forEach((id) => instance.popup.close(id))
      openedIds.clear()
      popups.value = []
    }
  }
}
