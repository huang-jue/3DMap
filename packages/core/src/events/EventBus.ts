export type EventHandler<T> = (payload: T) => void
export type Unsubscribe = () => void
export type EventErrorHandler = (error: unknown, type: PropertyKey) => void

const defaultErrorHandler: EventErrorHandler = (error, type) => {
  console.error(`[cesium-kit] 事件 "${String(type)}" 的监听器抛出异常`, error)
}

export class EventBus<T extends object = Record<string, unknown>> {
  private handlers = new Map<keyof T, Set<EventHandler<never>>>()

  constructor(private readonly onError: EventErrorHandler = defaultErrorHandler) {}

  on<K extends keyof T>(type: K, handler: EventHandler<T[K]>): Unsubscribe {
    let set = this.handlers.get(type)
    if (!set) {
      set = new Set()
      this.handlers.set(type, set)
    }
    set.add(handler as EventHandler<never>)
    return () => this.off(type, handler)
  }

  once<K extends keyof T>(type: K, handler: EventHandler<T[K]>): Unsubscribe {
    const unsubscribe = this.on(type, (payload) => {
      unsubscribe()
      handler(payload)
    })
    return unsubscribe
  }

  off<K extends keyof T>(type: K, handler: EventHandler<T[K]>): void {
    const set = this.handlers.get(type)
    if (!set) return
    set.delete(handler as EventHandler<never>)
    if (set.size === 0) this.handlers.delete(type)
  }

  emit<K extends keyof T>(type: K, payload: T[K]): void {
    const set = this.handlers.get(type)
    if (!set) return
    for (const handler of Array.from(set)) {
      try {
        ;(handler as EventHandler<T[K]>)(payload)
      } catch (error) {
        this.onError(error, type)
      }
    }
  }

  listenerCount<K extends keyof T>(type: K): number {
    return this.handlers.get(type)?.size ?? 0
  }

  clear(type?: keyof T): void {
    if (type === undefined) this.handlers.clear()
    else this.handlers.delete(type)
  }
}
