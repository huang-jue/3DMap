import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { normalizePath } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const STATIC_DIRS = ['Workers', 'Assets', 'Widgets', 'ThirdParty']

export interface CesiumAssetsOptions {
  /**
   * 静态资源部署路径，默认 'cesium'，即最终访问 `/cesium/Workers/...`。
   * 与 `@sgyx/cesium-kit-core` 的 `cesiumBaseUrl` 保持一致。
   */
  baseUrl?: string
  /** 是否通过 define 注入 CESIUM_BASE_URL，默认 true */
  defineBaseUrl?: boolean
  /** 是否在 dev 环境额外写入 window.CESIUM_BASE_URL，默认 true */
  runtimeBaseUrl?: boolean
  /**
   * Vite 项目根目录。默认 process.cwd()，若 vite 配置里改过 root 需要手动指定。
   */
  root?: string
  /** 手动指定资源路径裁剪层级，一般无需设置 */
  stripBase?: number
}

function resolveCesiumRoot(root: string): string {
  const projectRequire = createRequire(path.join(root, 'package.json'))
  try {
    return path.dirname(projectRequire.resolve('cesium/package.json'))
  } catch {
    try {
      const selfRequire = createRequire(import.meta.url)
      return path.dirname(selfRequire.resolve('cesium/package.json'))
    } catch {
      throw new Error(
        '[cesium-kit:vite] 未找到 cesium 依赖。请先安装：pnpm add cesium\n' +
          '  @sgyx/cesium-kit-vite 依赖消费者项目自行安装 cesium（peerDependency）。'
      )
    }
  }
}

function countBaseSegments(from: string, to: string): number {
  return path
    .relative(from, to)
    .split(/[\\/]+/)
    .filter((segment) => segment && segment !== '.' && segment !== '..').length
}

/**
 * 自动复制 Cesium 静态资源并注入 CESIUM_BASE_URL，
 * 解决 “Worker 404 / Assets 404 / 地图不显示” 这类最高频的接入问题。
 */
export function cesiumAssets(options: CesiumAssetsOptions = {}): Plugin[] {
  const root = options.root ?? process.cwd()
  const baseUrl = (options.baseUrl ?? 'cesium').replace(/^\/+|\/+$/g, '')
  const publicPath = `/${baseUrl}`
  const defineBaseUrl = options.defineBaseUrl ?? true
  const runtimeBaseUrl = options.runtimeBaseUrl ?? true

  const cesiumRoot = resolveCesiumRoot(root)
  const buildDir = path.join(cesiumRoot, 'Build', 'Cesium')

  if (!existsSync(buildDir)) {
    throw new Error(
      `[cesium-kit:vite] 未找到 Cesium 构建产物：${buildDir}\n` +
        '  请确认已安装 cesium，而不是仅安装了 @cesium/engine。'
    )
  }

  const stripBase = options.stripBase ?? countBaseSegments(root, buildDir)

  const plugins: Plugin[] = viteStaticCopy({
    targets: STATIC_DIRS.map((dir) => ({
      src: normalizePath(path.join(buildDir, dir, '**/*')),
      dest: baseUrl,
      rename: { stripBase }
    }))
  })

  plugins.push({
    name: 'cesium-kit:assets-define',
    config() {
      if (!defineBaseUrl) return undefined
      return {
        define: {
          CESIUM_BASE_URL: JSON.stringify(publicPath)
        }
      }
    }
  })

  if (runtimeBaseUrl) {
    plugins.push({
      name: 'cesium-kit:assets-runtime',
      transformIndexHtml(html) {
        return {
          html,
          tags: [
            {
              tag: 'script',
              attrs: { type: 'text/javascript' },
              children: `window.CESIUM_BASE_URL = ${JSON.stringify(publicPath)};`,
              injectTo: 'head-prepend'
            }
          ]
        }
      }
    })
  }

  return plugins
}
