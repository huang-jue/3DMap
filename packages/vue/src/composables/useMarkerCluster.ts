import { onBeforeUnmount, shallowRef, type ShallowRef } from 'vue'
import type * as Cesium from 'cesium'
import {
  MarkerClusterLayer,
  type MarkerClusterOptions,
  type MarkerClusteringOptions,
  type MarkerInput
} from '@cesium-kit/core'
import { useCesiumContext, whenReadySafe } from '../context'

export interface UseMarkerClusterOptions extends MarkerClusterOptions {
  bindPick?: boolean
  layerGroup?: string | { name: string; parentId?: string }
}

export interface UseMarkerClusterReturn {
  layer: ShallowRef<MarkerClusterLayer | null>
  add(marker: MarkerInput): Promise<Cesium.Entity | null>
  addMany(markers: MarkerInput[]): Promise<Cesium.Entity[]>
  remove(id: string): Promise<boolean>
  clear(): Promise<void>
  setVisible(visible: boolean): Promise<void>
  setClustering(options: MarkerClusteringOptions | false): Promise<void>
}

export function useMarkerCluster(options: UseMarkerClusterOptions = {}): UseMarkerClusterReturn {
  const context = useCesiumContext()
  const layer = shallowRef<MarkerClusterLayer | null>(null)
  const { bindPick = true, layerGroup, ...layerOptions } = options
  let unmounted = false

  const layerPromise: Promise<MarkerClusterLayer | null> = whenReadySafe(context).then(
    async (instance) => {
      if (!instance) return null
      let dataSource = layerOptions.dataSource
      if (!dataSource && layerGroup) {
        const group =
          typeof layerGroup === 'string'
            ? await instance.layerManager.createEntityGroup(layerGroup)
            : await instance.layerManager.createEntityGroup(layerGroup.name, {
                parentId: layerGroup.parentId
              })
        dataSource = group.dataSource
      }
      const created = new MarkerClusterLayer(instance.viewer, {
        ...layerOptions,
        dataSource,
        pick: bindPick ? instance.pick : layerOptions.pick
      })
      if (unmounted) {
        created.destroy()
        return null
      }
      layer.value = created
      return created
    }
  )

  onBeforeUnmount(() => {
    unmounted = true
    layer.value?.destroy()
    layer.value = null
  })

  return {
    layer,
    async add(marker) {
      return (await layerPromise)?.add(marker) ?? null
    },
    async addMany(markers) {
      return (await layerPromise)?.addMany(markers) ?? []
    },
    async remove(id) {
      return (await layerPromise)?.remove(id) ?? false
    },
    async clear() {
      ;(await layerPromise)?.clear()
    },
    async setVisible(visible) {
      ;(await layerPromise)?.setVisible(visible)
    },
    async setClustering(clustering) {
      ;(await layerPromise)?.setClustering(clustering)
    }
  }
}
