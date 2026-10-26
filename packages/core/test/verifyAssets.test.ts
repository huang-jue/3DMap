import { describe, expect, it, vi } from 'vitest'
import { verifyCesiumAssets } from '../src/utils/verifyAssets'

function response(status: number, contentType: string) {
  return new Response(null, {
    status,
    headers: { 'content-type': contentType }
  })
}

describe('verifyCesiumAssets', () => {
  it('全部可访问时返回 ok', async () => {
    const fetchImpl = vi.fn(async () => response(200, 'application/javascript'))

    const result = await verifyCesiumAssets({ baseUrl: '/cesium/', fetchImpl })

    expect(result.ok).toBe(true)
    expect(result.baseUrl).toBe('/cesium')
    expect(result.checks).toHaveLength(3)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('404 时判定失败并保留状态码', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('Workers') ? response(404, 'text/plain') : response(200, 'text/css')
    )

    const result = await verifyCesiumAssets({ baseUrl: '/cesium', fetchImpl })

    expect(result.ok).toBe(false)
    const workers = result.checks.find((check) => check.name === 'Workers')
    expect(workers?.ok).toBe(false)
    expect(workers?.status).toBe(404)
  })

  it('被 SPA 回退成 HTML 时判定失败', async () => {
    const fetchImpl = vi.fn(async () => response(200, 'text/html; charset=utf-8'))

    const result = await verifyCesiumAssets({ fetchImpl })

    expect(result.ok).toBe(false)
    expect(result.checks.every((check) => !check.ok)).toBe(true)
  })

  it('HEAD 返回 405 时回退到 GET', async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) =>
        init?.method === 'HEAD' ? response(405, 'text/plain') : response(200, 'text/plain')
    )

    const result = await verifyCesiumAssets({ fetchImpl })

    expect(result.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(6)
  })

  it('请求异常时记录错误信息', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down')
    })

    const result = await verifyCesiumAssets({ fetchImpl })

    expect(result.ok).toBe(false)
    expect(result.checks[0]?.error).toContain('network down')
  })
})
