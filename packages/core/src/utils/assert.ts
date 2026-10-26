export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`@cesium-kit/core: ${message}`)
}

let seq = 0

export function createId(prefix: string): string {
  seq += 1
  return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}`
}
