import { useCesiumContext, whenReadySafe } from '../context'

export interface UseCameraShareReturn {
  /** 生成分享链接，未就绪返回 null */
  getUrl(baseUrl?: string): Promise<string | null>
  /** 从 URL/hash 还原视角，未就绪或格式非法返回 false */
  applyFromUrl(url?: string): Promise<boolean>
  /** 复制分享链接到剪贴板，返回是否成功 */
  copyUrl(baseUrl?: string): Promise<boolean>
}

/** 相机视角分享（URL hash 编解码）。 */
export function useCameraShare(): UseCameraShareReturn {
  const context = useCesiumContext()
  const withManager = () => whenReadySafe(context)

  const getUrl = async (baseUrl?: string): Promise<string | null> => {
    const manager = await withManager()
    return manager?.camera.getShareUrl(baseUrl) ?? null
  }

  return {
    getUrl,
    async applyFromUrl(url) {
      const manager = await withManager()
      return manager?.camera.applyFromUrl(url) ?? false
    },
    async copyUrl(baseUrl) {
      const url = await getUrl(baseUrl)
      if (!url) return false
      const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
      if (!clipboard) return false
      try {
        await clipboard.writeText(url)
        return true
      } catch {
        return false
      }
    }
  }
}
