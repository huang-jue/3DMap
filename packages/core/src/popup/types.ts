import type * as Cesium from 'cesium'
import type { PositionInput } from '../types'

export type PopupContent = string | HTMLElement | (() => HTMLElement)

export interface PopupOptions {
  id?: string
  position: PositionInput
  content?: PopupContent
  title?: string
  className?: string
  offset?: [number, number]
  closable?: boolean
  showAnchor?: boolean
  zIndex?: number
  onClose?: () => void
}

export interface PopupHandle {
  readonly id: string
  readonly element: HTMLElement
  readonly isOpen: boolean
  setPosition(position: PositionInput): void
  setContent(content: PopupContent): void
  setTitle(title: string): void
  close(): void
}

export interface PopupScope {
  readonly size: number
  open(options: PopupOptions): PopupHandle
  close(id: string): void
  closeAll(): void
  dispose(): void
}

export interface PopupProjection {
  x: number
  y: number
  visible?: boolean
}

export interface PopupScheduler {
  add(callback: () => void): () => void
}

export interface PopupServiceOptions {
  container?: HTMLElement
  project?: (position: Cesium.Cartesian3) => PopupProjection | undefined
  isVisible?: (position: Cesium.Cartesian3) => boolean
  scheduler?: PopupScheduler
}
