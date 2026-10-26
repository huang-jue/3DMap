import * as Cesium from 'cesium'
import type { LayerClusteringOptions } from './types'

export class LayerEntityGroup {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly dataSource: Cesium.CustomDataSource
  ) {}

  get count(): number {
    return this.dataSource.entities.values.length
  }

  get entities(): Cesium.Entity[] {
    return this.dataSource.entities.values.slice()
  }

  add(entity: Cesium.Entity): Cesium.Entity {
    return this.dataSource.entities.add(entity)
  }

  addMany(entities: Cesium.Entity[]): Cesium.Entity[] {
    return entities.map((entity) => this.add(entity))
  }

  remove(id: string): boolean {
    return this.dataSource.entities.removeById(id)
  }

  clear(): void {
    this.dataSource.entities.removeAll()
  }

  setClustering(options: LayerClusteringOptions | false): void {
    if (options === false) {
      this.dataSource.clustering.enabled = false
      return
    }
    this.dataSource.clustering = new Cesium.EntityCluster({
      ...options,
      enabled: options.enabled ?? true
    })
  }

  destroy(): void {
    this.clear()
  }
}
