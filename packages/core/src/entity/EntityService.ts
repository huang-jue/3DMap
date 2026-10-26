import * as Cesium from 'cesium'

export type EntityInput = Cesium.Entity

/** 实体读写门面，所有实体都通过 Viewer.entities 统一管理。 */
export class EntityService {
  constructor(private readonly viewer: Cesium.Viewer) {}

  get count(): number {
    return this.viewer.entities.values.length
  }

  add(entity: EntityInput): Cesium.Entity {
    return this.viewer.entities.add(entity)
  }

  addMany(entities: EntityInput[]): Cesium.Entity[] {
    return entities.map((entity) => this.add(entity))
  }

  get(id: string): Cesium.Entity | undefined {
    return this.viewer.entities.getById(id)
  }

  list(): Cesium.Entity[] {
    return this.viewer.entities.values.slice()
  }

  remove(id: string): boolean {
    return this.viewer.entities.removeById(id)
  }

  removeAll(ids: string[]): void {
    ids.forEach((id) => this.remove(id))
  }

  clear(): void {
    this.viewer.entities.removeAll()
  }

  /** 按条件筛选实体。 */
  filter(predicate: (entity: Cesium.Entity) => boolean): Cesium.Entity[] {
    return this.viewer.entities.values.filter(predicate)
  }

  destroy(): void {
    if (this.viewer.isDestroyed()) return
    this.clear()
  }
}
