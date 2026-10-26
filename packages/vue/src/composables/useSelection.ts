import { onBeforeUnmount, onMounted, shallowRef } from 'vue'
import type { PickEventPayload, SelectionResult } from '@cesium-kit/core'
import { useCesiumContext, whenReadySafe } from '../context'

export function useSelection() {
  const context = useCesiumContext()
  const selected = shallowRef<SelectionResult | null>(null)
  const hovered = shallowRef<SelectionResult | null>(null)
  let disposed = false
  let unsubscribe: (() => void) | undefined
  onMounted(async () => {
    const manager = await whenReadySafe(context)
    if (!manager || disposed) return
    selected.value = manager.selection.state.selected
    hovered.value = manager.selection.state.hovered
    unsubscribe = manager.selection.onChange((state) => {
      selected.value = state.selected
      hovered.value = state.hovered
    })
  })
  onBeforeUnmount(() => {
    disposed = true
    unsubscribe?.()
  })
  return {
    selected,
    hovered,
    clear: async () => (await whenReadySafe(context))?.selection.clear(),
    select: async (payload: PickEventPayload | null) =>
      (await whenReadySafe(context))?.selection.select(payload) ?? null,
    setEnabled: async (enabled: boolean) =>
      (await whenReadySafe(context))?.selection.setEnabled(enabled)
  }
}
export type UseSelectionReturn = ReturnType<typeof useSelection>
