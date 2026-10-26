import type { CameraView, SceneModeName } from '../types'
import type { DrawGeoJSON } from '../draw/geojson'
import type { ImagerySource } from '../imagery/ImageryManager'
import type { TerrainInput } from '../terrain/TerrainManager'
import type { DataSourceInput } from '../datasource/DataSourceManager'
import type { TilesetSource } from '../tileset/TilesetManager'

export type SnapshotResourceKind = 'imagery' | 'terrain' | 'datasource' | 'tileset'
/** Register credential-bearing/custom inputs with an opaque, non-secret ID. */
export type SnapshotResource =
  | { kind: 'imagery'; source: ImagerySource }
  | { kind: 'terrain'; source: TerrainInput }
  | { kind: 'datasource'; source: DataSourceInput }
  | { kind: 'tileset'; source: TilesetSource }

export interface SnapshotResourceEntry {
  id: string
  kind: Exclude<SnapshotResourceKind, 'terrain'>
  source: unknown
  resourceRef?: string
  options: Record<string, unknown>
}

export interface SnapshotLayer {
  id: string
  name: string
  kind: 'group' | 'imagery' | 'datasource' | 'tileset'
  visible: boolean
  alpha: number
  resourceId?: string
  children: SnapshotLayer[]
}

export interface SnapshotIssue {
  id: string
  reason: string
}
export interface SceneSnapshot {
  version: 1
  camera: CameraView
  mode: SceneModeName
  terrain: { source?: 'ellipsoid' | 'world'; resourceRef?: string }
  resources: SnapshotResourceEntry[]
  layers: SnapshotLayer[]
  drawings: DrawGeoJSON
  clock: {
    currentTime: string
    startTime: string | null
    stopTime: string | null
    multiplier: number
    loop: boolean
    running: boolean
  }
}
export interface SnapshotCaptureResult {
  snapshot: SceneSnapshot
  skipped: SnapshotIssue[]
}
export interface SnapshotRestoreResult {
  succeeded: string[]
  failed: SnapshotIssue[]
  skipped: SnapshotIssue[]
}
export interface SnapshotRestoreOptions {
  resolveResource?: (
    id: string,
    kind: SnapshotResourceKind
  ) => SnapshotResource | Promise<SnapshotResource>
}
