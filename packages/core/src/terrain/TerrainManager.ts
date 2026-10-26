import { cancelledLoad } from '../utils/LoadGeneration'
import * as Cesium from 'cesium'
import { createLogger, type Logger } from '../utils/logger'

/** 地形来源：ellipsoid 表示无地形；world 需要有效的 Cesium ion token。 */
export type TerrainInput = 'ellipsoid' | 'world' | Cesium.TerrainProvider | Cesium.Terrain

export type TerrainName = 'ellipsoid' | 'world' | 'custom'

export class TerrainManager {
  private name: TerrainName = 'ellipsoid'
  private generation = 0
  private destroyed = false
  private cancelPending?: () => void
  private input: TerrainInput = 'ellipsoid'

  get source(): TerrainInput {
    return this.input
  }
  private log: Logger

  constructor(
    private readonly viewer: Cesium.Viewer,
    logger?: Logger
  ) {
    this.log = logger ?? createLogger('terrain')
  }

  get current(): TerrainName {
    return this.name
  }

  /** 切换地形，等待地形就绪后返回。 */
  async set(input: TerrainInput): Promise<void> {
    if (this.destroyed || this.viewer.isDestroyed()) throw new Error('TerrainManager 已销毁')
    const version = ++this.generation
    this.cancelPending?.()
    if (input === 'ellipsoid') {
      this.viewer.scene.terrainProvider = new Cesium.EllipsoidTerrainProvider()
      this.name = 'ellipsoid'
      this.input = input
      return
    }
    const terrain = input === 'world' ? Cesium.Terrain.fromWorldTerrain() : input
    if (terrain instanceof Cesium.Terrain) {
      await this.waitReady(terrain)
      if (version !== this.generation || this.destroyed || this.viewer.isDestroyed())
        throw cancelledLoad()
      this.viewer.scene.terrainProvider = terrain.provider
    } else {
      this.viewer.scene.terrainProvider = terrain
    }
    this.name = input === 'world' ? 'world' : 'custom'
    this.input = input
  }

  reset(): void {
    if (this.destroyed || this.viewer.isDestroyed()) return
    void this.set('ellipsoid')
  }

  destroy(): void {
    if (this.destroyed) return
    this.reset()
    this.destroyed = true
    ++this.generation
    this.cancelPending?.()
  }

  private waitReady(terrain: Cesium.Terrain): Promise<void> {
    if (terrain.ready) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        removeReady()
        removeError()
        this.cancelPending = undefined
      }
      const removeReady = terrain.readyEvent.addEventListener(() => {
        cleanup()
        resolve()
      })
      const removeError = terrain.errorEvent.addEventListener((error) => {
        cleanup()
        this.log.error('地形加载失败', error)
        reject(error instanceof Error ? error : new Error(String(error)))
      })
      this.cancelPending = () => {
        cleanup()
        reject(cancelledLoad())
      }
    })
  }
}
