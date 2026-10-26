import type { CesiumFeature, FeatureContext } from '@sgyx/cesium-kit-core'
import {
  createWindFieldFeature,
  type WindFieldFeature,
  type WindFieldFeatureOptions
} from './field/createWindFieldFeature'
import {
  createWindFarmFeature,
  type WindFarmFeature,
  type WindFarmFeatureOptions
} from './farm/createWindFarmFeature'

export interface WindPluginConfig {
  /** 气象风场；传 false 表示不启用 */
  field?: WindFieldFeatureOptions | false
  /** 风电场；传 false 表示不启用 */
  farm?: WindFarmFeatureOptions | false
  /** 插件名，默认 wind-plugin */
  name?: string
}

export interface WindPlugin extends CesiumFeature {
  readonly field: WindFieldFeature | null
  readonly farm: WindFarmFeature | null
}

/**
 * 按配置组合气象风场与风电场。
 *
 * 不需要风场的项目不安装 `@sgyx/cesium-kit-wind` 即可；
 * 安装了但只想启用其中一项时，把另一项设为 false。
 */
export function createWindPlugin(config: WindPluginConfig): WindPlugin {
  const field = config.field ? createWindFieldFeature(config.field) : null
  const farm = config.farm ? createWindFarmFeature(config.farm) : null

  return {
    name: config.name ?? 'wind-plugin',
    get field() {
      return field
    },
    get farm() {
      return farm
    },
    async install(ctx: FeatureContext) {
      if (field) await field.install(ctx, config.field as WindFieldFeatureOptions)
      if (farm) await farm.install(ctx, config.farm as WindFarmFeatureOptions)
      if (field && farm && !(config.farm && config.farm.windSampler)) {
        farm.setWindSampler((lon, lat) => field.getDataAtLonLat(lon, lat))
      }
      ctx.log.info(
        `风场插件已启用：field=${Boolean(field)}, farm=${Boolean(farm)}`
      )
    },
    dispose() {
      field?.dispose?.()
      farm?.dispose?.()
    }
  }
}
