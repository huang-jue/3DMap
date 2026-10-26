import type { App } from 'vue'
import type { CesiumKitOptions } from '@cesium-kit/core'
import { CESIUM_KIT_OPTIONS_KEY } from './context'

export interface CesiumKitPluginOptions {
  /** 全局 Cesium ion token */
  ionToken?: string
  /** 全局默认 Viewer 选项，会被组件 props.options 覆盖 */
  defaultViewerOptions?: CesiumKitOptions
}

export interface CesiumKitPlugin {
  install(app: App, options?: CesiumKitPluginOptions): void
}

/**
 * 全局安装：`app.use(CesiumKit, { ionToken, defaultViewerOptions })`
 * 只注入默认配置，不会创建 Viewer。
 */
export const CesiumKit: CesiumKitPlugin = {
  install(app, options = {}) {
    app.provide(CESIUM_KIT_OPTIONS_KEY, options)
  }
}
