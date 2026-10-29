export interface DataRequestOptions {
  signal?: AbortSignal
  bypassCache?: boolean
}
export interface DataLoadDiagnostic {
  key: string
  status: 'loading' | 'ready' | 'error'
  cacheHit: boolean
  durationMs: number
  error?: string
}
interface Pending {
  controller: AbortController
  promise: Promise<unknown>
  consumers: number
}
function sizeOf(value: unknown, seen = new Set<object>()): number {
  if (typeof value === 'string') return value.length * 2
  if (typeof value === 'number') return 8
  if (!value || typeof value !== 'object' || seen.has(value)) return 0
  seen.add(value)
  if (ArrayBuffer.isView(value)) return value.byteLength
  if (value instanceof ArrayBuffer) return value.byteLength
  if (Array.isArray(value) && (value.length === 0 || typeof value[0] === 'number'))
    return value.length * 8
  return Object.values(value).reduce<number>((total, item) => total + sizeOf(item, seen), 0)
}

/** Shared immutable parsed data; cancellation belongs to each consumer. */
export class DataRepository {
  private cache = new Map<string, { value: unknown; bytes: number }>()
  private pending = new Map<string, Pending>()
  private bytes = 0
  private active = 0
  private queue: Array<() => void> = []
  private diagnostics = new Map<string, DataLoadDiagnostic>()
  constructor(
    readonly maxBytes = 128 * 1024 * 1024,
    readonly concurrency = 4
  ) {
    if (maxBytes < 0 || !Number.isInteger(concurrency) || concurrency < 1)
      throw new Error('非法缓存配置')
  }
  get stats() {
    return {
      bytes: this.bytes,
      entries: this.cache.size,
      active: this.active,
      pending: this.pending.size
    }
  }
  get loads(): DataLoadDiagnostic[] {
    return [...this.diagnostics.values()].map((item) => ({ ...item }))
  }
  clear(): void {
    this.cache.clear()
    this.bytes = 0
    this.diagnostics.clear()
  }
  private record(value: DataLoadDiagnostic): void {
    this.diagnostics.delete(value.key)
    this.diagnostics.set(value.key, value)
    if (this.diagnostics.size > 100) this.diagnostics.delete(this.diagnostics.keys().next().value!)
  }
  async request(url: string | URL, signal?: AbortSignal): Promise<Response> {
    signal?.throwIfAborted()
    await new Promise<void>((resolve, reject) => {
      const start = () => {
        signal?.removeEventListener('abort', abort)
        this.active++
        resolve()
      }
      const abort = () => {
        this.queue = this.queue.filter((item) => item !== start)
        reject(signal?.reason)
      }
      if (this.active < this.concurrency) start()
      else {
        this.queue.push(start)
        signal?.addEventListener('abort', abort, { once: true })
      }
    })
    try {
      const response = await fetch(url, {
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
          : AbortSignal.timeout(30_000)
      })
      if (!response.ok) throw new Error(`数据请求失败 ${response.status} ${response.statusText}`)
      // Include body transfer in the concurrency limit, not just response headers.
      const buffer = await response.arrayBuffer()
      return new Response(buffer, { headers: response.headers, status: response.status })
    } finally {
      this.active--
      this.queue.shift()?.()
    }
  }
  json(url: string, options: DataRequestOptions = {}): Promise<unknown> {
    return this.load(
      `json:${url}`,
      async (signal) => (await this.request(url, signal)).json(),
      options
    )
  }
  load<T>(
    key: string,
    loader: (signal: AbortSignal) => Promise<T>,
    options: DataRequestOptions = {}
  ): Promise<T> {
    options.signal?.throwIfAborted()
    const cached = this.cache.get(key)
    if (cached && !options.bypassCache) {
      this.cache.delete(key)
      this.cache.set(key, cached)
      this.record({ key, status: 'ready', durationMs: 0, cacheHit: true })
      return Promise.resolve(cached.value as T)
    }
    const pendingKey = options.bypassCache ? `reload:${key}` : key
    let entry = this.pending.get(pendingKey)
    if (!entry) {
      const controller = new AbortController()
      const started = performance.now()
      this.record({ key, status: 'loading', durationMs: 0, cacheHit: false })
      entry = {
        controller,
        consumers: 0,
        promise: Promise.resolve().then(() => loader(controller.signal))
      }
      const own = entry
      entry.promise = entry.promise
        .then(
          (value) => {
            controller.signal.throwIfAborted()
            const bytes = sizeOf(value)
            if (bytes <= this.maxBytes) {
              const old = this.cache.get(key)
              if (old) {
                this.bytes -= old.bytes
                this.cache.delete(key)
              }
              this.cache.set(key, { value, bytes })
              this.bytes += bytes
              while (this.bytes > this.maxBytes) {
                const first = this.cache.keys().next().value!
                this.bytes -= this.cache.get(first)!.bytes
                this.cache.delete(first)
              }
            }
            this.record({
              key,
              status: 'ready',
              cacheHit: false,
              durationMs: performance.now() - started
            })
            return value
          },
          (error) => {
            if (!controller.signal.aborted)
              this.record({
                key,
                status: 'error',
                cacheHit: false,
                durationMs: performance.now() - started,
                error: String(error)
              })
            throw error
          }
        )
        .finally(() => {
          if (this.pending.get(pendingKey) === own) this.pending.delete(pendingKey)
        })
      this.pending.set(pendingKey, entry)
    }
    entry.consumers++
    const current = entry
    return new Promise<T>((resolve, reject) => {
      let done = false
      const finish = () => {
        if (done) return false
        done = true
        options.signal?.removeEventListener('abort', abort)
        if (--current.consumers === 0 && this.pending.get(pendingKey) === current) {
          this.pending.delete(pendingKey)
          current.controller.abort()
        }
        return true
      }
      const abort = () => {
        if (finish()) reject(options.signal?.reason ?? new DOMException('已取消', 'AbortError'))
      }
      options.signal?.addEventListener('abort', abort, { once: true })
      current.promise.then(
        (value) => {
          if (finish()) resolve(value as T)
        },
        (error) => {
          if (finish()) reject(error)
        }
      )
    })
  }
}
export const sharedDataRepository = new DataRepository()
