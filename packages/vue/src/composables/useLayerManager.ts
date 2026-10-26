import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import type {
  AddDataSourceLayerOptions,
  AddImageryLayerOptions,
  AddTilesetLayerOptions,
  CesiumViewerManager,
  DataSourceInput,
  ImagerySource,
  LayerEntityGroup,
  LayerEntityGroupOptions,
  LayerNode,
  LayerNodeOptions,
  TilesetSource
} from '@cesium-kit/core'
import { useCesiumContext, whenReadySafe } from '../context'

export interface UseLayerManagerReturn {
  tree: Ref<LayerNode[]>
  refresh(): Promise<void>
  createGroup(name: string, options?: LayerNodeOptions): Promise<LayerNode | null>
  addImagery(
    source: ImagerySource,
    options?: AddImageryLayerOptions
  ): Promise<LayerNode | null>
  addDataSource(
    name: string,
    input: DataSourceInput,
    options?: AddDataSourceLayerOptions
  ): Promise<LayerNode | null>
  addTileset(
    name: string,
    source: TilesetSource,
    options?: AddTilesetLayerOptions
  ): Promise<LayerNode | null>
  createEntityGroup(
    name: string,
    options?: LayerEntityGroupOptions
  ): Promise<LayerEntityGroup | null>
  move(id: string, parentId: string, index: number): Promise<void>
  setVisible(id: string, visible: boolean): Promise<void>
  setAlpha(id: string, alpha: number): Promise<void>
  remove(id: string, options?: { removeSource?: boolean }): Promise<void>
  clear(): Promise<void>
}

export function useLayerManager(): UseLayerManagerReturn {
  const context = useCesiumContext()
  const tree = ref<LayerNode[]>([])
  const disposers: Array<() => void> = []
  let manager: CesiumViewerManager | null = null
  let unmounted = false

  const refreshWith = (instance: CesiumViewerManager): void => {
    tree.value = instance.layerManager.tree()
  }

  const refresh = async (): Promise<void> => {
    const instance = await whenReadySafe(context)
    if (!instance) return
    manager = instance
    refreshWith(instance)
  }

  onMounted(async () => {
    const instance = await whenReadySafe(context)
    if (!instance || unmounted) return
    manager = instance
    refreshWith(instance)
    disposers.push(instance.events.on('layer:change', () => refreshWith(instance)))
  })

  onBeforeUnmount(() => {
    unmounted = true
    disposers.forEach((dispose) => dispose())
    disposers.length = 0
    manager = null
  })

  const getManager = async (): Promise<CesiumViewerManager | null> => {
    manager = manager ?? (await whenReadySafe(context))
    return manager
  }

  return {
    tree,
    refresh,
    async createGroup(name, options) {
      const instance = await getManager()
      if (!instance) return null
      const node = instance.layerManager.createGroup(name, options)
      refreshWith(instance)
      return node
    },
    async addImagery(source, options) {
      const instance = await getManager()
      if (!instance) return null
      const node = await instance.layerManager.addImagery(source, options)
      refreshWith(instance)
      return node
    },
    async addDataSource(name, input, options) {
      const instance = await getManager()
      if (!instance) return null
      const node = await instance.layerManager.addDataSource(name, input, options)
      refreshWith(instance)
      return node
    },
    async addTileset(name, source, options) {
      const instance = await getManager()
      if (!instance) return null
      const node = await instance.layerManager.addTileset(name, source, options)
      refreshWith(instance)
      return node
    },
    async createEntityGroup(name, options) {
      const instance = await getManager()
      if (!instance) return null
      const group = await instance.layerManager.createEntityGroup(name, options)
      refreshWith(instance)
      return group
    },
    async move(id, parentId, index) {
      const instance = await getManager()
      if (!instance) return
      instance.layerManager.move(id, parentId, index)
      refreshWith(instance)
    },
    async setVisible(id, visible) {
      const instance = await getManager()
      if (!instance) return
      instance.layerManager.setVisible(id, visible)
      refreshWith(instance)
    },
    async setAlpha(id, alpha) {
      const instance = await getManager()
      if (!instance) return
      instance.layerManager.setAlpha(id, alpha)
      refreshWith(instance)
    },
    async remove(id, options) {
      const instance = await getManager()
      if (!instance) return
      instance.layerManager.remove(id, options)
      refreshWith(instance)
    },
    async clear() {
      const instance = await getManager()
      if (!instance) return
      instance.layerManager.clear()
      refreshWith(instance)
    }
  }
}
