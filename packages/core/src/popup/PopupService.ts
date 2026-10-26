import * as Cesium from 'cesium'
import { resolvePosition } from '../coords'
import type { PositionInput } from '../types'
import { createId } from '../utils/assert'
import { createLogger, type Logger } from '../utils/logger'
import type {
  PopupContent,
  PopupHandle,
  PopupOptions,
  PopupProjection,
  PopupScope,
  PopupServiceOptions
} from './types'

interface PopupEntry {
  id: string
  element: HTMLElement
  contentElement: HTMLElement
  headerElement: HTMLElement | null
  titleElement: HTMLElement | null
  position: Cesium.Cartesian3
  options: PopupOptions
}

function mountContent(target: HTMLElement, content?: PopupContent): void {
  target.replaceChildren()
  if (content === undefined) return
  if (typeof content === 'string') {
    target.innerHTML = content
    return
  }
  if (typeof content === 'function') {
    target.appendChild(content())
    return
  }
  target.appendChild(content)
}

export class PopupService {
  private readonly overlay: HTMLElement
  private readonly entries = new Map<string, PopupEntry>()
  private readonly log: Logger
  private unsubscribe: (() => void) | null = null
  private destroyed = false

  constructor(
    private readonly viewer: Cesium.Viewer,
    private readonly options: PopupServiceOptions = {},
    logger?: Logger
  ) {
    this.log = logger ?? createLogger('popup')
    const host = options.container ?? viewer.container
    if (!host) throw new Error('@cesium-kit/core: PopupService 缺少挂载容器')
    this.overlay = document.createElement('div')
    this.overlay.className = 'cesium-kit-popup-layer'
    Object.assign(this.overlay.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      pointerEvents: 'none',
      zIndex: '20'
    })
    host.appendChild(this.overlay)

    const scheduler = options.scheduler ?? {
      add: (callback: () => void) => viewer.scene.postRender.addEventListener(callback)
    }
    this.unsubscribe = scheduler.add(this.updateAll)
  }

  get size(): number {
    return this.entries.size
  }

  open(options: PopupOptions): PopupHandle {
    if (this.destroyed) {
      throw new Error('@cesium-kit/core: PopupService 已销毁')
    }
    const id = options.id ?? createId('popup')
    if (this.entries.has(id)) this.close(id)

    const element = document.createElement('div')
    element.className = ['cesium-kit-popup', options.className].filter(Boolean).join(' ')
    element.dataset.popupId = id
    Object.assign(element.style, {
      position: 'absolute',
      display: 'none',
      pointerEvents: 'auto',
      transform: 'translate(-50%, -100%)',
      minWidth: '140px',
      maxWidth: '320px',
      padding: '10px 12px',
      borderRadius: '8px',
      color: 'var(--cesium-kit-popup-color, #1f2937)',
      background: 'var(--cesium-kit-popup-bg, #ffffff)',
      boxShadow: 'var(--cesium-kit-popup-shadow, 0 8px 24px rgba(15, 23, 42, 0.18))',
      font: '13px/1.5 system-ui, sans-serif',
      whiteSpace: 'normal',
      zIndex: String(options.zIndex ?? 21)
    })

    const header = document.createElement('div')
    Object.assign(header.style, {
      fontWeight: '600',
      marginBottom: '4px',
      paddingRight: '18px'
    })
    header.hidden = true

    const title = document.createElement('span')
    header.appendChild(title)

    const content = document.createElement('div')
    content.className = 'cesium-kit-popup-content'

    element.appendChild(header)
    element.appendChild(content)

    if (options.showAnchor !== false) {
      const anchor = document.createElement('div')
      Object.assign(anchor.style, {
        position: 'absolute',
        left: '50%',
        bottom: '-7px',
        width: '0',
        height: '0',
        transform: 'translateX(-50%)',
        borderLeft: '7px solid transparent',
        borderRight: '7px solid transparent',
        borderTop: '8px solid var(--cesium-kit-popup-bg, #ffffff)'
      })
      element.appendChild(anchor)
    }

    if (options.closable !== false) {
      const close = document.createElement('button')
      close.type = 'button'
      close.setAttribute('aria-label', '关闭')
      close.textContent = '×'
      Object.assign(close.style, {
        position: 'absolute',
        top: '4px',
        right: '6px',
        border: 'none',
        background: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
        font: '16px/1 sans-serif',
        padding: '2px'
      })
      close.addEventListener('click', () => this.close(id))
      element.appendChild(close)
    }

    const entry: PopupEntry = {
      id,
      element,
      contentElement: content,
      headerElement: header,
      titleElement: title,
      position: resolvePosition(options.position),
      options
    }
    this.entries.set(id, entry)
    this.overlay.appendChild(element)
    this.applyTitle(entry, options.title)
    mountContent(content, options.content)
    this.updateEntry(entry)

    return this.createHandle(entry)
  }

  close(id: string): void {
    const entry = this.entries.get(id)
    if (!entry) return
    this.entries.delete(id)
    entry.element.remove()
    try {
      entry.options.onClose?.()
    } catch (error) {
      this.log.warn('弹窗关闭回调异常', error)
    }
  }

  closeAll(): void {
    Array.from(this.entries.keys()).forEach((id) => this.close(id))
  }

  createScope(): PopupScope {
    const ids = new Set<string>()
    const closeScoped = (id: string): void => {
      ids.delete(id)
      this.close(id)
    }
    return {
      get size() {
        return ids.size
      },
      open: (options) => {
        const handle = this.open(options)
        ids.add(handle.id)
        return {
          get id() {
            return handle.id
          },
          get element() {
            return handle.element
          },
          get isOpen() {
            return handle.isOpen
          },
          setPosition: (position) => handle.setPosition(position),
          setContent: (content) => handle.setContent(content),
          setTitle: (title) => handle.setTitle(title),
          close: () => {
            ids.delete(handle.id)
            handle.close()
          }
        }
      },
      close: closeScoped,
      closeAll: () => {
        Array.from(ids).forEach(closeScoped)
        ids.clear()
      },
      dispose: () => {
        Array.from(ids).forEach(closeScoped)
        ids.clear()
      }
    }
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.closeAll()
    this.unsubscribe?.()
    this.unsubscribe = null
    this.overlay.remove()
  }

  private createHandle(entry: PopupEntry): PopupHandle {
    return {
      get id() {
        return entry.id
      },
      get element() {
        return entry.element
      },
      get isOpen() {
        return entry.element.style.display !== 'none'
      },
      setPosition: (position: PositionInput) => {
        entry.position = resolvePosition(position)
        this.updateEntry(entry)
      },
      setContent: (content: PopupContent) => {
        entry.options = { ...entry.options, content }
        mountContent(entry.contentElement, content)
      },
      setTitle: (title: string) => {
        entry.options = { ...entry.options, title }
        this.applyTitle(entry, title)
      },
      close: () => this.close(entry.id)
    }
  }

  private applyTitle(entry: PopupEntry, title?: string): void {
    if (!entry.headerElement || !entry.titleElement) return
    entry.headerElement.hidden = !title
    entry.titleElement.textContent = title ?? ''
  }

  private updateAll = (): void => {
    this.entries.forEach((entry) => this.updateEntry(entry))
  }

  private updateEntry(entry: PopupEntry): void {
    if (this.destroyed || this.viewer.isDestroyed()) return
    const projected = this.project(entry.position)
    if (!projected || projected.visible === false) {
      entry.element.style.display = 'none'
      return
    }
    if (this.options.isVisible && !this.options.isVisible(entry.position)) {
      entry.element.style.display = 'none'
      return
    }

    const canvas = this.viewer.scene.canvas
    const width = canvas.clientWidth || canvas.width
    const height = canvas.clientHeight || canvas.height
    if (
      projected.x < 0 ||
      projected.y < 0 ||
      projected.x > width ||
      projected.y > height
    ) {
      entry.element.style.display = 'none'
      return
    }

    const [offsetX, offsetY] = entry.options.offset ?? [0, -12]
    entry.element.style.left = `${projected.x + offsetX}px`
    entry.element.style.top = `${projected.y + offsetY}px`
    entry.element.style.display = 'block'
  }

  private project(position: Cesium.Cartesian3): PopupProjection | undefined {
    if (this.options.project) return this.options.project(position)
    if (this.viewer.isDestroyed()) return undefined
    const scene = this.viewer.scene
    const screen = Cesium.SceneTransforms.worldToWindowCoordinates(scene, position)
    if (!screen) return undefined
    let visible = true
    if (scene.mode === Cesium.SceneMode.SCENE3D && scene.globe) {
      const occluder = new Cesium.EllipsoidalOccluder(
        scene.globe.ellipsoid,
        this.viewer.camera.positionWC
      )
      visible = occluder.isPointVisible(position)
    }
    return { x: screen.x, y: screen.y, visible }
  }
}
