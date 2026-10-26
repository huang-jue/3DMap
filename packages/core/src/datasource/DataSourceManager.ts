import type { EventBus } from '../events/EventBus'
import type { CesiumKitEventMap } from '../types'
import { LoadGeneration, cancelledLoad, disposeResource } from '../utils/LoadGeneration'
import * as Cesium from 'cesium'
import { createLogger, type Logger } from '../utils/logger'
import { applyDataSourceStyle, type DataSourceStyle } from './style'

export type DataSourceType = 'geojson' | 'czml' | 'kml'

export interface DataSourceInput {
  type: DataSourceType
  /** URL、字符串内容或已解析对象 */
  data: string | object | Cesium.Resource
  /** 透传给 Cesium 对应 load 方法的选项 */
  options?: Record<string, unknown>
}

export interface DataSourceLoaders {
  geojson: (
    data: string | object | Cesium.Resource,
    options?: Record<string, unknown>
  ) => Promise<Cesium.GeoJsonDataSource>
  czml: (
    data: string | object | Cesium.Resource,
    options?: Record<string, unknown>
  ) => Promise<Cesium.CzmlDataSource>
  kml: (
    data: string | object | Cesium.Resource,
    options?: Record<string, unknown>
  ) => Promise<Cesium.KmlDataSource>
}

export interface AddDataSourceOptions {
  show?: boolean
  /** 加载完成后飞向数据范围 */
  flyTo?: boolean
  /** 统一应用样式 */
  style?: DataSourceStyle
}

export interface DataSourceInfo {
  name: string
  show: boolean
  entities: number
}

const defaultLoaders: DataSourceLoaders = {
  geojson: (data, options) =>
    Cesium.GeoJsonDataSource.load(
      data as never,
      options as never
    ) as Promise<Cesium.GeoJsonDataSource>,
  czml: (data, options) =>
    Cesium.CzmlDataSource.load(data as never, options as never) as Promise<Cesium.CzmlDataSource>,
  kml: (data, options) =>
    Cesium.KmlDataSource.load(data as never, options as never) as Promise<Cesium.KmlDataSource>
}

/**
 * GeoJSON / CZML / KML 数据源管理。
 * 加载器可注入，便于在无网络环境下测试。
 */
export class DataSourceManager {
  private entries = new Map<string, Cesium.DataSource>()
  private log: Logger
  private destroyed = false
  private loads = new LoadGeneration()
  private definitions = new Map<
    string,
    { source: DataSourceInput; options: AddDataSourceOptions }
  >()
  private loaders: DataSourceLoaders

  constructor(
    private readonly viewer: Cesium.Viewer,
    loaders: Partial<DataSourceLoaders> = {},
    logger?: Logger,
    private readonly events?: EventBus<CesiumKitEventMap>
  ) {
    this.log = logger ?? createLogger('datasource')
    this.loaders = { ...defaultLoaders, ...loaders }
  }

  /** Original declarative inputs; consumers must not mutate these values. */
  definition(name: string) {
    return this.definitions.get(name)
  }

  get size(): number {
    return this.entries.size
  }

  has(name: string): boolean {
    return this.entries.has(name)
  }

  get(name: string): Cesium.DataSource | undefined {
    return this.entries.get(name)
  }

  list(): DataSourceInfo[] {
    return Array.from(this.entries.entries()).map(([name, dataSource]) => ({
      name,
      show: dataSource.show,
      entities: dataSource.entities.values.length
    }))
  }

  async add(
    name: string,
    input: DataSourceInput,
    options: AddDataSourceOptions = {}
  ): Promise<Cesium.DataSource> {
    this.assertAlive()
    const loader = this.loaders[input.type]
    if (!loader) {
      throw new Error(`@cesium-kit/core: 不支持的数据源类型 "${input.type}"`)
    }

    this.remove(name)
    const token = this.loads.begin(name)
    let resource:
      | (Cesium.DataSource & { destroy?: () => void; isDestroyed?: () => boolean })
      | undefined
    let attached = false
    const check = (): void => {
      if (this.destroyed || this.viewer.isDestroyed() || !this.loads.current(name, token)) {
        throw cancelledLoad()
      }
    }
    try {
      const dataSource = await loader(input.data, input.options)
      resource = dataSource
      check()
      dataSource.show = options.show ?? true
      if (options.style) applyDataSourceStyle(dataSource, options.style)
      await this.viewer.dataSources.add(dataSource)
      attached = true
      check()
      this.entries.set(name, dataSource)
      this.definitions.set(name, { source: input, options: { ...options } })
      if (options.flyTo) await this.flyTo(name)
      check()
      return dataSource
    } catch (error) {
      if (resource) {
        if (this.entries.get(name) === resource) {
          this.entries.delete(name)
          this.definitions.delete(name)
        }
        if (attached && !this.viewer.isDestroyed()) this.viewer.dataSources.remove(resource, true)
        disposeResource(resource)
      }
      if (this.loads.current(name, token) && !this.destroyed && !this.viewer.isDestroyed()) {
        this.events?.emit('error', { source: 'datasource', resourceId: name, error })
      }
      throw error
    }
  }

  setStyle(name: string, style: DataSourceStyle): void {
    this.assertAlive()
    const dataSource = this.entries.get(name)
    if (!dataSource) {
      this.log.warn(`数据源不存在：${name}`)
      return
    }
    applyDataSourceStyle(dataSource, style)
    const definition = this.definitions.get(name)
    if (definition) definition.options.style = style
    this.events?.emit('resource:change', { source: 'datasource', id: name, action: 'style' })
  }

  setShow(name: string, show: boolean): void {
    const dataSource = this.entries.get(name)
    if (!dataSource) return
    dataSource.show = show
  }

  /** 飞向数据源范围，返回是否成功。 */
  async flyTo(name: string, duration?: number): Promise<boolean> {
    const dataSource = this.entries.get(name)
    if (!dataSource) return false
    const options = duration === undefined ? undefined : { duration }
    return this.viewer.flyTo(dataSource, options)
  }

  remove(name: string): boolean {
    this.loads.cancel(name)
    this.definitions.delete(name)
    const dataSource = this.entries.get(name)
    if (!dataSource) return false
    this.entries.delete(name)
    this.events?.emit('resource:change', { source: 'datasource', id: name, action: 'remove' })
    return !this.viewer.isDestroyed() && this.viewer.dataSources.remove(dataSource, true)
  }

  clear(): void {
    this.loads.clear()
    Array.from(this.entries.keys()).forEach((name) => this.remove(name))
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.loads.clear()
    this.definitions.clear()
    if (this.viewer.isDestroyed()) {
      this.entries.clear()
      return
    }
    this.clear()
  }

  private assertAlive(): void {
    if (this.destroyed || this.viewer.isDestroyed()) {
      throw new Error('@cesium-kit/core: DataSourceManager 已销毁，不能再加载数据源')
    }
  }
}
