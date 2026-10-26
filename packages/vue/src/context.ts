import {
  computed,
  inject,
  shallowRef,
  type ComputedRef,
  type InjectionKey,
  type ShallowRef
} from 'vue'
import type { CesiumViewerManager } from '@sgyx/cesium-kit-core'
import type { CesiumKitPluginOptions } from './plugin'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  // 无人 await 时避免 UnhandledPromiseRejection
  promise.catch(() => undefined)
  return { promise, resolve, reject }
}

export interface CesiumKitContext {
  /** 当前 Viewer 管理器，未就绪时为 null */
  manager: ShallowRef<CesiumViewerManager | null>
  /** 初始化错误 */
  error: ShallowRef<unknown>
  /** 是否已就绪 */
  ready: ComputedRef<boolean>
  /** 等待 Viewer 就绪 */
  whenReady(): Promise<CesiumViewerManager>
  resolve(manager: CesiumViewerManager): void
  fail(error: unknown): void
  reset(): void
}

export function createCesiumContext(): CesiumKitContext {
  const manager = shallowRef<CesiumViewerManager | null>(null)
  const error = shallowRef<unknown>(null)
  const ready = computed(() => manager.value !== null)
  let deferred = createDeferred<CesiumViewerManager>()
  let settled = false

  return {
    manager,
    error,
    ready,
    whenReady() {
      return manager.value ? Promise.resolve(manager.value) : deferred.promise
    },
    resolve(instance) {
      manager.value = instance
      if (settled) return
      settled = true
      deferred.resolve(instance)
    },
    fail(reason) {
      error.value = reason
      if (settled) return
      settled = true
      deferred.reject(reason)
    },
    reset() {
      manager.value = null
      error.value = null
      // 初始化期间（尚未 settle）不能替换 deferred，否则子组件的 whenReady 会一直挂起
      if (settled) {
        settled = false
        deferred = createDeferred<CesiumViewerManager>()
      }
    }
  }
}

export const CESIUM_KIT_CONTEXT_KEY: InjectionKey<CesiumKitContext> = Symbol('cesium-kit:context')
export const CESIUM_KIT_OPTIONS_KEY: InjectionKey<CesiumKitPluginOptions> = Symbol(
  'cesium-kit:options'
)

export function useCesiumContext(): CesiumKitContext {
  const context = inject(CESIUM_KIT_CONTEXT_KEY, null)
  if (!context) {
    throw new Error(
      '[cesium-kit:vue] 未找到 Viewer 上下文，请把组件放到 <CesiumViewer> 内部使用'
    )
  }
  return context
}

/** 等待就绪，初始化失败时返回 null 而不是抛错。 */
export function whenReadySafe(context: CesiumKitContext): Promise<CesiumViewerManager | null> {
  return context.whenReady().catch(() => null)
}
