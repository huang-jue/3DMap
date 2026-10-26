import { computed, onBeforeUnmount, onMounted, ref, type ComputedRef, type Ref } from 'vue'
import type {
  CesiumViewerManager,
  DrawGeoJSON,
  DrawOptions,
  DrawResult,
  DrawSession,
  DrawType
} from '@sgyx/cesium-kit-core'
import { useCesiumContext, whenReadySafe } from '../context'

export interface UseDrawReturn {
  active: Ref<DrawSession | null>
  drawing: ComputedRef<boolean>
  results: Ref<DrawResult[]>
  start(type: DrawType, options?: Omit<DrawOptions, 'type'>): Promise<DrawSession | null>
  exportGeoJSON(): Promise<DrawGeoJSON | null>
  importGeoJSON(input: unknown): Promise<DrawSession[]>
  cancel(): Promise<void>
  clear(): Promise<void>
}

export function useDraw(): UseDrawReturn {
  const context = useCesiumContext()
  const active = ref<DrawSession | null>(null)
  const results = ref<DrawResult[]>([])
  const drawing = computed(() => active.value?.state === 'drawing')
  const disposers: Array<() => void> = []
  let manager: CesiumViewerManager | null = null
  let unmounted = false

  const sync = (instance: CesiumViewerManager): void => {
    results.value = instance.draw.sessionList
      .map((session) => session.result)
      .filter((result): result is DrawResult => Boolean(result))
  }

  const findSession = (id: string): DrawSession | null =>
    manager?.draw.sessionList.find((session) => session.id === id) ?? null

  onMounted(async () => {
    const instance = await whenReadySafe(context)
    if (!instance || unmounted) return
    manager = instance
    sync(instance)
    active.value = instance.draw.sessionList.find((session) => session.state === 'drawing') ?? null
    disposers.push(
      instance.events.on('draw:start', ({ id }) => {
        active.value = findSession(id)
        sync(instance)
      }),
      instance.events.on('draw:update', () => {
        sync(instance)
      }),
      instance.events.on('draw:complete', (result) => {
        active.value = findSession(result.id)
        sync(instance)
      }),
      instance.events.on('draw:remove', () => sync(instance)),
      instance.events.on('draw:cancel', () => {
        active.value = null
        sync(instance)
      })
    )
  })

  onBeforeUnmount(() => {
    unmounted = true
    if (active.value?.state === 'drawing') manager?.draw.cancel()
    disposers.forEach((dispose) => dispose())
    disposers.length = 0
    active.value = null
    manager = null
  })

  return {
    active,
    drawing,
    results,
    async start(type, options) {
      const instance = await whenReadySafe(context)
      if (!instance) return null
      const session = instance.draw.start(type, options)
      active.value = session
      return session
    },
    async exportGeoJSON() {
      return (await whenReadySafe(context))?.draw.exportGeoJSON() ?? null
    },
    async importGeoJSON(input) {
      const instance = await whenReadySafe(context)
      const sessions = instance?.draw.importGeoJSON(input) ?? []
      if (instance) sync(instance)
      return sessions
    },
    async cancel() {
      const instance = await whenReadySafe(context)
      instance?.draw.cancel()
      active.value = null
    },
    async clear() {
      const instance = await whenReadySafe(context)
      instance?.draw.clear()
      active.value = null
      results.value = []
    }
  }
}
