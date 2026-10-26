/** Logical cancellation without depending on Cesium transport cancellation. */
export class LoadGeneration {
  private tokens = new Map<string, object>()

  begin(id: string): object {
    const token = {}
    this.tokens.set(id, token)
    return token
  }

  current(id: string, token: object): boolean {
    return this.tokens.get(id) === token
  }

  cancel(id: string): void {
    this.tokens.delete(id)
  }

  clear(): void {
    this.tokens.clear()
  }
}

export function cancelledLoad(): Error {
  const error = new Error('@cesium-kit/core: 加载已取消或被新的请求替代')
  error.name = 'AbortError'
  return error
}

export function disposeResource(value: {
  destroy?: () => void
  isDestroyed?: () => boolean
}): void {
  if (!value.isDestroyed?.()) value.destroy?.()
}
