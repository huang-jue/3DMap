import type { SnapshotRestoreOptions } from '@sgyx/cesium-kit-core'
import { useCesiumContext } from '../context'

export function useSceneSnapshot() {
  const context = useCesiumContext()
  const service = async () => (await context.whenReady()).snapshots
  return {
    capture: async () => (await service()).capture(),
    restore: async (input: unknown, options?: SnapshotRestoreOptions) =>
      (await service()).restore(input, options),
    saveLocal: async (key?: string) => (await service()).saveLocal(key),
    restoreLocal: async (key?: string, options?: SnapshotRestoreOptions) =>
      (await service()).restoreLocal(key, options)
  }
}
export type UseSceneSnapshotReturn = ReturnType<typeof useSceneSnapshot>
