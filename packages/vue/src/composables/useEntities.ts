import { ref, type Ref } from 'vue'
import type * as Cesium from 'cesium'
import type { CesiumViewerManager } from '@sgyx/cesium-kit-core'
import { useCesiumContext, whenReadySafe } from '../context'

export interface UseEntitiesReturn {
  count: Ref<number>
  add(entity: Cesium.Entity): Promise<Cesium.Entity | null>
  addMany(entities: Cesium.Entity[]): Promise<Cesium.Entity[]>
  remove(id: string): Promise<boolean>
  clear(): Promise<void>
  list(): Promise<Cesium.Entity[]>
  filter(predicate: (entity: Cesium.Entity) => boolean): Promise<Cesium.Entity[]>
}

/** 实体增删查，配合 core 的 createPoint/createLabel 等工厂使用。 */
export function useEntities(): UseEntitiesReturn {
  const context = useCesiumContext()
  const count = ref(0)
  const withManager = (): Promise<CesiumViewerManager | null> => whenReadySafe(context)

  const sync = (manager: CesiumViewerManager): void => {
    count.value = manager.entities.count
  }

  return {
    count,
    async add(entity) {
      const manager = await withManager()
      if (!manager) return null
      const added = manager.entities.add(entity)
      sync(manager)
      return added
    },
    async addMany(entities) {
      const manager = await withManager()
      if (!manager) return []
      const added = manager.entities.addMany(entities)
      sync(manager)
      return added
    },
    async remove(id) {
      const manager = await withManager()
      if (!manager) return false
      const removed = manager.entities.remove(id)
      sync(manager)
      return removed
    },
    async clear() {
      const manager = await withManager()
      if (!manager) return
      manager.entities.clear()
      sync(manager)
    },
    async list() {
      const manager = await withManager()
      return manager?.entities.list() ?? []
    },
    async filter(predicate) {
      const manager = await withManager()
      return manager?.entities.filter(predicate) ?? []
    }
  }
}
