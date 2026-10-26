export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

export function assertBrowser(feature: string): void {
  if (!isBrowser()) {
    throw new Error(`@cesium-kit/core: ${feature} 只能在浏览器环境中使用（当前为 SSR/Node 环境）`)
  }
}
