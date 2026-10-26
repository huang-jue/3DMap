import * as Cesium from 'cesium'

export interface AssetCheck {
  name: string
  url: string
  ok: boolean
  status?: number
  error?: string
}

export interface VerifyAssetsOptions {
  /** 覆盖 Cesium 静态资源根路径；默认取 buildModuleUrl 解析结果 */
  baseUrl?: string
  /** 单个请求超时（毫秒），默认 5000 */
  timeout?: number
  /** 自定义 fetch，便于测试 */
  fetchImpl?: typeof fetch
}

export interface VerifyAssetsResult {
  ok: boolean
  baseUrl: string
  checks: AssetCheck[]
}

const CHECKS = [
  { name: 'Workers', path: 'Workers/transferTypedArrayTest.js' },
  { name: 'Assets', path: 'Assets/Textures/NaturalEarthII/tilemapresource.xml' },
  { name: 'Widgets', path: 'Widgets/widgets.css' }
]

function resolveBaseUrl(baseUrl?: string): string {
  if (baseUrl) return baseUrl.replace(/\/+$/, '')
  return Cesium.buildModuleUrl('').replace(/\/+$/, '')
}

async function probe(
  url: string,
  timeout: number,
  fetchImpl: typeof fetch
): Promise<Omit<AssetCheck, 'name' | 'url'>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    let response = await fetchImpl(url, { method: 'HEAD', signal: controller.signal })
    if (response.status === 405 || response.status === 501) {
      response = await fetchImpl(url, { method: 'GET', signal: controller.signal })
    }
    const contentType = response.headers.get('content-type') ?? ''
    // 被 SPA 回退成 index.html 时也视为失败
    const looksLikeHtml = contentType.includes('text/html')
    return { ok: response.ok && !looksLikeHtml, status: response.status }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 探测 Cesium 静态资源是否可访问，用于快速定位 “Worker 404 / 地图黑屏”。
 */
export async function verifyCesiumAssets(
  options: VerifyAssetsOptions = {}
): Promise<VerifyAssetsResult> {
  const baseUrl = resolveBaseUrl(options.baseUrl)
  const timeout = options.timeout ?? 5000
  const fetchImpl = options.fetchImpl ?? fetch

  const checks = await Promise.all(
    CHECKS.map(async (item) => {
      const url = `${baseUrl}/${item.path}`
      const result = await probe(url, timeout, fetchImpl)
      return { name: item.name, url, ...result }
    })
  )

  return { ok: checks.every((check) => check.ok), baseUrl, checks }
}
