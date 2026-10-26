import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import type { CesiumFeature } from '@sgyx/cesium-kit-core'
import { useCesiumContext, whenReadySafe } from '../context'

export interface UseFeatureReturn {
  registered: Ref<boolean>
  /** 最近一次注册失败的原因 */
  error: Ref<unknown>
  register(): Promise<void>
  unregister(): void
}

/**
 * 在 Vue 组件生命周期内注册业务插件，卸载时自动注销并回收图层。
 * 插件实现完全基于 @sgyx/cesium-kit-core 的公开契约。
 */
export function useFeature<T>(feature: CesiumFeature<T>, options?: T): UseFeatureReturn {
  const context = useCesiumContext()
  const registered = ref(false)
  const error = ref<unknown>(null)
  let unmounted = false

  const register = async (): Promise<void> => {
    error.value = null
    const manager = await whenReadySafe(context)
    if (!manager || unmounted || manager.isDestroyed()) return
    if (manager.features.has(feature.name)) return
    try {
      await manager.features.register(feature, options)
      registered.value = true
    } catch (reason) {
      error.value = reason
      registered.value = false
      console.error(`[cesium-kit:vue] 插件 "${feature.name}" 注册失败`, reason)
    }
  }

  const unregister = (): void => {
    context.manager.value?.features.unregister(feature.name)
    registered.value = false
  }

  onMounted(() => {
    void register()
  })

  onBeforeUnmount(() => {
    unmounted = true
    unregister()
  })

  return { registered, error, register, unregister }
}
