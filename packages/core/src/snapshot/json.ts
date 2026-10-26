import * as Cesium from 'cesium'

/** Reject instances and credentials rather than silently losing data with JSON.stringify. */
export function snapshotJSON(value: unknown, seen = new Set<object>()): unknown {
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    if (
      /[?&](?:[^=]*(?:token|key|signature|credential|auth)[^=]*)=/i.test(value) ||
      /^https?:\/\/[^/]*@/.test(value)
    )
      throw new Error('带鉴权的 URL 请注册 resourceRef')
    return value
  }
  if (value instanceof Cesium.Color) return value.toCssColorString()
  if (value instanceof Cesium.Cesium3DTileStyle) return snapshotJSON(value.style, seen)
  if (typeof value !== 'object' || !value || seen.has(value))
    throw new Error('不能序列化函数、实例或循环引用')
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)
    throw new Error('自定义实例请注册 resourceRef')
  seen.add(value)
  try {
    if (Array.isArray(value)) return value.map((item) => snapshotJSON(item, seen))
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue
      if (
        ['__proto__', 'constructor', 'prototype'].includes(key) ||
        /token|password|authorization|credential|secret|apiKey/i.test(key)
      )
        throw new Error('敏感配置请由宿主资源解析器提供')
      result[key] = snapshotJSON(item, seen)
    }
    return result
  } finally {
    seen.delete(value)
  }
}
