import {
  circleRing,
  geoJSONPosition,
  validateDrawGeoJSON,
  type DrawGeoJSON,
  type DrawGeoJSONFeature
} from './geojson'
import * as Cesium from 'cesium'
import type { CoordService } from '../coords'
import { resolvePosition } from '../coords'
import type { EventBus } from '../events/EventBus'
import type { CesiumKitEventMap, PositionInput } from '../types'
import { createId } from '../utils/assert'
import { toColor } from '../utils/color'
import { createLogger, type Logger } from '../utils/logger'
import {
  formatArea,
  formatDistance,
  formatHeight,
  getRectangleCorners,
  summarizeMeasurement
} from './measurement'
import type {
  DrawDraft,
  DrawEventHandlerLike,
  DrawMeasurementOptions,
  DrawOptions,
  DrawResult,
  DrawSession,
  DrawState,
  DrawStyle,
  DrawType,
  EntitySink,
  MeasurementSummary,
  PickToggle
} from './types'

interface DragState {
  session: DrawSessionImpl
  index: number
}

interface SessionOptions extends DrawOptions {
  type: DrawType
}

interface ResolvedStyle {
  pointColor: Cesium.Color
  pointSize: number
  lineColor: Cesium.Color
  lineWidth: number
  polygonColor: Cesium.Color
  polygonOutlineColor: Cesium.Color
  polygonOutlineWidth: number
  dashed: boolean
  clampToGround: boolean
}

const DEFAULT_STYLE: ResolvedStyle = {
  pointColor: Cesium.Color.fromCssColorString('#409eff'),
  pointSize: 9,
  lineColor: Cesium.Color.fromCssColorString('#409eff'),
  lineWidth: 3,
  polygonColor: Cesium.Color.fromCssColorString('#409eff').withAlpha(0.35),
  polygonOutlineColor: Cesium.Color.fromCssColorString('#409eff'),
  polygonOutlineWidth: 2,
  dashed: false,
  clampToGround: false
}

function resolveStyle(style: DrawStyle = {}, clampToGround?: boolean): ResolvedStyle {
  return {
    pointColor: toColor(style.pointColor ?? DEFAULT_STYLE.pointColor),
    pointSize: style.pointSize ?? DEFAULT_STYLE.pointSize,
    lineColor: toColor(style.lineColor ?? DEFAULT_STYLE.lineColor),
    lineWidth: style.lineWidth ?? DEFAULT_STYLE.lineWidth,
    polygonColor: toColor(style.polygonColor ?? DEFAULT_STYLE.polygonColor),
    polygonOutlineColor: toColor(style.polygonOutlineColor ?? DEFAULT_STYLE.polygonOutlineColor),
    polygonOutlineWidth: style.polygonOutlineWidth ?? DEFAULT_STYLE.polygonOutlineWidth,
    dashed: style.dashed ?? DEFAULT_STYLE.dashed,
    clampToGround: clampToGround ?? style.clampToGround ?? DEFAULT_STYLE.clampToGround
  }
}

function resolveMeasurement(type: DrawType, input: DrawOptions['measure']): DrawMeasurementOptions {
  if (input === false) {
    return { distance: false, area: false, height: false, segmentLabels: false }
  }
  const options = input === true || input === undefined ? {} : input
  return {
    distance: options.distance ?? (type !== 'polygon' && type !== 'rectangle' && type !== 'circle'),
    area: options.area ?? (type === 'polygon' || type === 'rectangle' || type === 'circle'),
    height: options.height ?? type === 'height',
    segmentLabels: options.segmentLabels ?? false,
    decimals: options.decimals ?? 2
  }
}

function needsTwoPoints(type: DrawType): boolean {
  return type === 'rectangle' || type === 'circle' || type === 'height'
}

function minPointCount(type: DrawType): number {
  if (type === 'point') return 1
  if (type === 'polygon') return 3
  return 2
}

function heightReference(clampToGround: boolean): Cesium.HeightReference {
  return clampToGround ? Cesium.HeightReference.CLAMP_TO_GROUND : Cesium.HeightReference.NONE
}

class DrawSessionImpl implements DrawSession {
  readonly id: string
  readonly type: DrawType
  state: DrawState = 'drawing'
  result: DrawResult | null = null
  editable = false

  private controlPoints: Cesium.Cartesian3[] = []
  private preview: Cesium.Cartesian3 | null = null
  private entity: Cesium.Entity | null = null
  private labels: Cesium.Entity[] = []
  private handles: Cesium.Entity[] = []
  private handleIndices = new Map<string, number>()
  private dragIndex: number | null = null
  private readonly style: ResolvedStyle
  private readonly measurement: DrawMeasurementOptions

  constructor(
    private readonly service: DrawService,
    private readonly options: SessionOptions,
    private readonly coords: CoordService,
    private readonly sink: EntitySink,
    private readonly requestRender: () => void
  ) {
    this.id = options.id ?? createId('draw')
    this.type = options.type
    this.style = resolveStyle(options.style, options.clampToGround)
    this.measurement = resolveMeasurement(options.type, options.measure)
    this.editable = options.editable !== false
  }

  ownsEntity(entity: Cesium.Entity): boolean {
    return this.entity === entity || this.labels.includes(entity) || this.handles.includes(entity)
  }

  exportFeature(): DrawGeoJSONFeature {
    const controls = this.controlPoints.map((point) => this.coords.toDegrees(point))
    const coordinates = this.positions.map((point) => geoJSONPosition(this.coords.toDegrees(point)))
    const style = Object.fromEntries(
      Object.entries(this.style).map(([key, value]) => [
        key,
        value instanceof Cesium.Color ? value.toCssColorString() : value
      ])
    )
    let geometry: DrawGeoJSONFeature['geometry']
    if (this.type === 'point') geometry = { type: 'Point', coordinates: coordinates[0]! }
    else if (this.type === 'polyline' || this.type === 'height')
      geometry = { type: 'LineString', coordinates }
    else {
      const ring =
        this.type === 'circle'
          ? circleRing(controls[0]!, controls[1]!)
          : [...coordinates, coordinates[0]!]
      geometry = { type: 'Polygon', coordinates: [ring] }
    }
    return {
      type: 'Feature',
      id: this.id,
      geometry,
      properties: {
        name: this.options.name ?? '',
        cesiumKit: {
          version: 1,
          type: this.type,
          controlPoints: controls.map(geoJSONPosition),
          style,
          measure: this.measurement,
          editable: this.editable
        }
      }
    }
  }

  get positions(): Cesium.Cartesian3[] {
    return this.getResultPositions()
  }

  addPoint(position: Cesium.Cartesian3): void {
    if (this.state !== 'drawing') return
    if (needsTwoPoints(this.type) && this.controlPoints.length >= 2) return

    this.controlPoints.push(position)
    this.preview = null
    this.ensureEntity()
    this.refresh()

    if (this.type === 'point' || (needsTwoPoints(this.type) && this.controlPoints.length === 2)) {
      this.finish()
    }
  }

  setPreview(position: Cesium.Cartesian3): void {
    if (this.state !== 'drawing' || this.controlPoints.length === 0) return
    if (needsTwoPoints(this.type) && this.controlPoints.length >= 2) return
    this.preview = position
    this.ensureEntity()
    this.refresh()
  }

  finish(): void {
    if (this.state !== 'drawing') return
    if (this.controlPoints.length < minPointCount(this.type)) return

    this.state = 'completed'
    this.preview = null
    this.result = this.buildResult()
    this.refresh()
    if (this.editable) this.setEditable(true)
    this.options.onComplete?.(this.result)
    this.service.notifyFinished(this)
  }

  cancel(): void {
    if (this.state === 'completed') {
      this.remove()
      return
    }
    if (this.state === 'cancelled') return
    this.state = 'cancelled'
    this.disposeEntities()
    this.options.onCancel?.()
    this.service.notifyCancelled(this)
  }

  remove(): void {
    if (this.state === 'cancelled') return
    this.state = 'cancelled'
    this.disposeEntities()
    this.result = null
    this.service.notifyRemoved(this)
  }

  setEditable(editable: boolean): void {
    if (this.state !== 'completed') return
    this.editable = editable
    if (editable) this.createHandles()
    else this.removeHandles()
    this.requestRender()
  }

  beginDrag(index: number): void {
    if (index < 0 || index >= this.controlPoints.length) return
    this.dragIndex = index
  }

  updateDrag(position: Cesium.Cartesian3): void {
    if (this.dragIndex === null) return
    this.updateVertex(this.dragIndex, position)
  }

  endDrag(): void {
    if (this.dragIndex === null) return
    this.dragIndex = null
    this.updateHandlePositions()
    this.requestRender()
  }

  findHandle(entityId: string): number | undefined {
    return this.handleIndices.get(entityId)
  }

  updateVertex(index: number, position: PositionInput): void {
    if (index < 0 || index >= this.controlPoints.length) return
    this.controlPoints[index] = resolvePosition(position)
    if (this.state === 'completed') this.result = this.buildResult()
    this.refresh()
  }

  removeTrailingDuplicate(): void {
    if (this.controlPoints.length < 2) return
    const last = this.controlPoints[this.controlPoints.length - 1] as Cesium.Cartesian3
    const previous = this.controlPoints[this.controlPoints.length - 2] as Cesium.Cartesian3
    if (Cesium.Cartesian3.distance(last, previous) < 1) {
      this.controlPoints.pop()
    }
  }

  private ensureEntity(): void {
    if (this.entity) return
    const first = this.controlPoints[0]
    if (!first) return
    this.entity = this.sink.add(this.createEntity())
  }

  private createEntity(): Cesium.Entity {
    const id = this.id
    const name = this.options.name
    const clamp = this.style.clampToGround
    const reference = heightReference(clamp)

    if (this.type === 'point') {
      return new Cesium.Entity({
        id,
        name,
        position: this.controlPoints[0],
        point: {
          pixelSize: this.style.pointSize,
          color: this.style.pointColor,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          heightReference: reference,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      })
    }

    if (this.type === 'polyline' || this.type === 'height') {
      return new Cesium.Entity({
        id,
        name,
        polyline: {
          positions: new Cesium.CallbackProperty(() => this.renderLinePositions(), false),
          width: this.style.lineWidth,
          clampToGround: clamp,
          material:
            this.style.dashed || this.type === 'height'
              ? new Cesium.PolylineDashMaterialProperty({ color: this.style.lineColor })
              : this.style.lineColor
        }
      })
    }

    if (this.type === 'circle') {
      return new Cesium.Entity({
        id,
        name,
        position: new Cesium.CallbackPositionProperty(
          () => this.controlPoints[0] ?? Cesium.Cartesian3.ZERO,
          false
        ),
        ellipse: {
          semiMajorAxis: new Cesium.CallbackProperty(() => this.currentRadius(), false),
          semiMinorAxis: new Cesium.CallbackProperty(() => this.currentRadius(), false),
          material: this.style.polygonColor,
          outline: true,
          outlineColor: this.style.polygonOutlineColor,
          outlineWidth: this.style.polygonOutlineWidth,
          heightReference: reference
        }
      })
    }

    return new Cesium.Entity({
      id,
      name,
      polygon: {
        hierarchy: new Cesium.CallbackProperty(
          () => new Cesium.PolygonHierarchy(this.renderPolygonPositions()),
          false
        ),
        material: this.style.polygonColor,
        outline: true,
        outlineColor: this.style.polygonOutlineColor,
        outlineWidth: this.style.polygonOutlineWidth,
        heightReference: reference
      }
    })
  }

  private currentRadius(): number {
    if (this.controlPoints.length < 2) return 0
    const center = this.controlPoints[0] as Cesium.Cartesian3
    const edge = this.controlPoints[1] as Cesium.Cartesian3
    const centerCarto = Cesium.Cartographic.fromCartesian(center)
    const edgeCarto = Cesium.Cartographic.fromCartesian(edge)
    if (!centerCarto || !edgeCarto) return Cesium.Cartesian3.distance(center, edge)
    return new Cesium.EllipsoidGeodesic(centerCarto, edgeCarto).surfaceDistance
  }

  private renderLinePositions(): Cesium.Cartesian3[] {
    const points = this.getDrawingPositions()
    return points.length >= 2 ? points : []
  }

  private renderPolygonPositions(): Cesium.Cartesian3[] {
    if (this.type === 'rectangle') {
      const points = this.getControlWithPreview()
      return points.length >= 2
        ? getRectangleCorners(points[0] as Cesium.Cartesian3, points[1] as Cesium.Cartesian3)
        : []
    }
    const points = this.getDrawingPositions()
    return points.length >= 3 ? points : []
  }

  private getControlWithPreview(): Cesium.Cartesian3[] {
    const points = this.controlPoints.slice()
    if (this.preview && points.length < 2) points.push(this.preview)
    if (this.preview && points.length === 2) points[1] = this.preview
    return points
  }

  private getDrawingPositions(): Cesium.Cartesian3[] {
    if (this.state === 'completed') {
      return this.getResultPositions()
    }
    return this.getControlWithPreview()
  }

  private getResultPositions(): Cesium.Cartesian3[] {
    if (this.type === 'rectangle' && this.controlPoints.length >= 2) {
      return getRectangleCorners(
        this.controlPoints[0] as Cesium.Cartesian3,
        this.controlPoints[1] as Cesium.Cartesian3
      )
    }
    return this.controlPoints.slice()
  }

  private buildResult(): DrawResult {
    const cartesianPositions = this.getResultPositions()
    const positions = cartesianPositions.map((position) => this.coords.toDegrees(position))
    return {
      id: this.id,
      type: this.type,
      entity: this.entity as Cesium.Entity,
      positions,
      cartesianPositions,
      measurement: summarizeMeasurement(this.type, this.controlPoints)
    }
  }

  private refresh(): void {
    this.ensureEntity()
    this.rebuildLabels()
    this.updateHandlePositions()
    this.emitUpdate()
    this.requestRender()
  }

  private emitUpdate(): void {
    const draft: DrawDraft = {
      id: this.id,
      type: this.type,
      positions: this.getResultPositions().map((position) => this.coords.toDegrees(position)),
      measurement: summarizeMeasurement(this.type, this.controlPoints)
    }
    this.options.onUpdate?.(draft)
    this.service.emitUpdate(draft)
  }

  private rebuildLabels(): void {
    this.labels.forEach((label) => this.sink.remove(label))
    this.labels = []
    if (
      this.measurement.distance === false &&
      this.measurement.area === false &&
      this.measurement.height === false
    ) {
      return
    }

    const points = this.getResultPositions()
    if (points.length === 0) return
    if ((this.type === 'polyline' || this.type === 'height') && points.length < 2) return
    if ((this.type === 'polygon' || this.type === 'rectangle') && points.length < 3) return
    if (this.type === 'circle' && points.length < 2) return
    const summary = summarizeMeasurement(this.type, this.controlPoints)
    const decimals = this.measurement.decimals ?? 2

    if (this.type === 'polyline' || this.type === 'height') {
      const text = this.lineText(summary, decimals)
      if (text) this.addLabel(points[points.length - 1] as Cesium.Cartesian3, text)
      if (this.measurement.segmentLabels) {
        const segments = measureSegments(points)
        segments.forEach((segment, index) => {
          if (index >= points.length - 1) return
          const a = points[index] as Cesium.Cartesian3
          const b = points[index + 1] as Cesium.Cartesian3
          this.addLabel(
            Cesium.Cartesian3.midpoint(a, b, new Cesium.Cartesian3()),
            formatDistance(segment, decimals)
          )
        })
      }
      return
    }

    if (this.type === 'polygon' || this.type === 'rectangle') {
      const text = this.polygonText(summary, decimals)
      if (text) this.addLabel(centroid(points), text)
      return
    }

    if (this.type === 'circle') {
      const text = this.circleText(summary, decimals)
      if (text) this.addLabel(points[0] as Cesium.Cartesian3, text)
    }
  }

  private lineText(summary: MeasurementSummary, decimals: number): string {
    const parts: string[] = []
    if (this.measurement.distance !== false && summary.distance !== undefined) {
      parts.push(`距离 ${formatDistance(summary.distance, decimals)}`)
    }
    if (this.measurement.height !== false && summary.heightDiff !== undefined) {
      parts.push(`高差 ${formatHeight(summary.heightDiff, decimals)}`)
    }
    return parts.join(' · ')
  }

  private polygonText(summary: MeasurementSummary, decimals: number): string {
    const parts: string[] = []
    if (summary.area !== undefined) parts.push(`面积 ${formatArea(summary.area, decimals)}`)
    if (this.type === 'rectangle' && summary.width !== undefined && summary.height !== undefined) {
      parts.push(
        `${formatDistance(summary.width, decimals)} × ${formatDistance(summary.height, decimals)}`
      )
    } else if (summary.perimeter !== undefined) {
      parts.push(`周长 ${formatDistance(summary.perimeter, decimals)}`)
    }
    return parts.join(' · ')
  }

  private circleText(summary: MeasurementSummary, decimals: number): string {
    const parts: string[] = []
    if (summary.radius !== undefined) parts.push(`半径 ${formatDistance(summary.radius, decimals)}`)
    if (summary.area !== undefined) parts.push(`面积 ${formatArea(summary.area, decimals)}`)
    return parts.join(' · ')
  }

  private addLabel(position: Cesium.Cartesian3, text: string): void {
    if (!text) return
    const label = this.sink.add(
      new Cesium.Entity({
        position,
        label: {
          text,
          font: '13px sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('rgba(17, 24, 39, 0.82)'),
          pixelOffset: new Cesium.Cartesian2(0, -18),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      })
    )
    this.labels.push(label)
  }

  private createHandles(): void {
    if (this.handles.length > 0) return
    this.handleIndices.clear()
    this.controlPoints.forEach((point, index) => {
      const handle = this.sink.add(
        new Cesium.Entity({
          id: `${this.id}-handle-${index}`,
          position: point,
          point: {
            pixelSize: 9,
            color: Cesium.Color.fromCssColorString('#facc15'),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        })
      )
      this.handles.push(handle)
      this.handleIndices.set(handle.id, index)
    })
  }

  private updateHandlePositions(): void {
    this.handles.forEach((handle, index) => {
      const point = this.controlPoints[index]
      if (point) handle.position = new Cesium.ConstantPositionProperty(point)
    })
  }

  private removeHandles(): void {
    this.handles.forEach((handle) => this.sink.remove(handle))
    this.handles = []
    this.handleIndices.clear()
  }

  private disposeEntities(): void {
    this.removeHandles()
    this.labels.forEach((label) => this.sink.remove(label))
    this.labels = []
    if (this.entity) {
      this.sink.remove(this.entity)
      this.entity = null
    }
  }
}

function measureSegments(points: Cesium.Cartesian3[]): number[] {
  const segments: number[] = []
  for (let i = 1; i < points.length; i += 1) {
    const a = Cesium.Cartographic.fromCartesian(points[i - 1] as Cesium.Cartesian3)
    const b = Cesium.Cartographic.fromCartesian(points[i] as Cesium.Cartesian3)
    segments.push(a && b ? new Cesium.EllipsoidGeodesic(a, b).surfaceDistance : 0)
  }
  return segments
}

function centroid(points: Cesium.Cartesian3[]): Cesium.Cartesian3 {
  if (points.length === 0) return Cesium.Cartesian3.ZERO
  const average = points.reduce(
    (sum, point) => Cesium.Cartesian3.add(sum, point, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  )
  Cesium.Cartesian3.divideByScalar(average, points.length, average)
  const carto = Cesium.Cartographic.fromCartesian(average)
  if (!carto) return average
  return Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height)
}

export class DrawService {
  private handler: DrawEventHandlerLike | null = null
  private sessions: DrawSessionImpl[] = []
  private active: DrawSessionImpl | null = null
  private drag: DragState | null = null
  private readonly sink: EntitySink
  private readonly pick?: PickToggle
  private readonly events?: EventBus<CesiumKitEventMap>
  private readonly requestRender: () => void
  private readonly createHandlerFactory?: (canvas: HTMLCanvasElement) => DrawEventHandlerLike
  private readonly keyboardTarget?: Pick<Document, 'addEventListener' | 'removeEventListener'>
  private readonly log: Logger
  private pickDisabledByDraw = false
  private pickWasEnabled = true
  private dragPickWasEnabled = true
  private cameraInputsWasEnabled = true
  private restoreTimer: ReturnType<typeof setTimeout> | null = null
  private destroyed = false

  constructor(
    private readonly viewer: Cesium.Viewer,
    private readonly coords: CoordService,
    options: import('./types').DrawServiceOptions = {}
  ) {
    this.sink = options.sink ?? {
      add: (entity) => this.viewer.entities.add(entity),
      remove: (entity) => {
        this.viewer.entities.remove(entity)
      }
    }
    this.pick = options.pick
    this.events = options.events
    this.createHandlerFactory = options.createHandler
    this.requestRender =
      options.requestRender ??
      (() => {
        if (!this.viewer.isDestroyed()) this.viewer.scene.requestRender?.()
      })
    this.keyboardTarget =
      options.keyboardTarget ?? (typeof document === 'undefined' ? undefined : document)
    this.log = options.logger ?? createLogger('draw')
    this.keyboardTarget?.addEventListener('keydown', this.handleKeyDown)
  }

  get isDestroyed(): boolean {
    return this.destroyed
  }

  get isDrawing(): boolean {
    return this.active?.state === 'drawing'
  }

  get sessionList(): DrawSession[] {
    return this.sessions.slice()
  }

  start(type: DrawType, options: Omit<DrawOptions, 'type'> = {}): DrawSession {
    if (this.destroyed) {
      throw new Error('@cesium-kit/core: DrawService 已销毁')
    }
    if (this.active?.state === 'drawing') this.active.cancel()
    this.sessions.forEach((session) => {
      if (session.state === 'completed') session.setEditable(false)
    })
    this.active = null
    this.ensureHandler()
    this.disablePick()

    const session = new DrawSessionImpl(
      this,
      { ...options, type },
      this.coords,
      this.sink,
      this.requestRender
    )
    this.sessions.push(session)
    this.active = session
    this.events?.emit('draw:start', { id: session.id, type })
    this.requestRender()
    return session
  }

  /** Includes result graphics, measurement labels and edit handles. */
  ownsEntity(entity: Cesium.Entity): boolean {
    return this.sessions.some((session) => session.ownsEntity(entity))
  }

  exportGeoJSON(): DrawGeoJSON {
    return {
      type: 'FeatureCollection',
      features: this.sessions
        .filter((session) => session.state === 'completed')
        .map((session) => session.exportFeature())
    }
  }

  importGeoJSON(input: unknown): DrawSession[] {
    if (this.destroyed) throw new Error('@cesium-kit/core: DrawService 已销毁')
    const entries = validateDrawGeoJSON(input)
    const imported: DrawSession[] = []
    try {
      for (const entry of entries) {
        const session = this.start(entry.type, entry.options) as DrawSessionImpl
        imported.push(session)
        entry.positions.forEach((point) => session.addPoint(resolvePosition(point)))
        session.finish()
      }
      imported.forEach((session, index) =>
        session.setEditable(entries[index]!.options.editable !== false)
      )
      return imported
    } catch (error) {
      imported.forEach((session) => session.remove())
      throw error
    }
  }

  cancel(): void {
    if (this.active?.state === 'drawing') this.active.cancel()
  }

  clear(): void {
    if (this.active?.state === 'drawing') this.active.cancel()
    this.sessions.slice().forEach((session) => session.remove())
    this.sessions = []
    this.active = null
    this.restorePick()
    this.requestRender()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.clear()
    this.keyboardTarget?.removeEventListener('keydown', this.handleKeyDown)
    if (this.restoreTimer !== null) {
      clearTimeout(this.restoreTimer)
      this.restoreTimer = null
    }
    const handler = this.handler
    this.handler = null
    if (handler && !handler.isDestroyed?.()) {
      try {
        handler.destroy()
      } catch (error) {
        this.log.warn('销毁绘制处理器失败', error)
      }
    }
  }

  notifyFinished(session: DrawSessionImpl): void {
    this.active = session
    this.restorePickSoon()
    if (session.result) this.events?.emit('draw:complete', session.result)
  }

  notifyCancelled(session: DrawSessionImpl): void {
    this.sessions = this.sessions.filter((item) => item !== session)
    if (this.active === session) this.active = null
    this.restorePickSoon()
    this.events?.emit('draw:cancel', { id: session.id })
  }

  notifyRemoved(session: DrawSessionImpl): void {
    this.sessions = this.sessions.filter((item) => item !== session)
    if (this.active === session) this.active = null
    this.restorePickSoon()
    this.events?.emit('draw:remove', { id: session.id })
  }

  emitUpdate(draft: DrawDraft): void {
    this.events?.emit('draw:update', draft)
  }

  private ensureHandler(): void {
    if (this.handler || this.viewer.isDestroyed()) return
    const canvas = this.viewer.scene.canvas
    const factory =
      this.createHandlerFactory ??
      ((target: HTMLCanvasElement) =>
        new Cesium.ScreenSpaceEventHandler(target) as unknown as DrawEventHandlerLike)
    this.handler = factory(canvas)

    this.handler.setInputAction(
      (event: unknown) => this.handleClick(event),
      Cesium.ScreenSpaceEventType.LEFT_CLICK
    )
    this.handler.setInputAction(
      (event: unknown) => this.handleMouseMove(event),
      Cesium.ScreenSpaceEventType.MOUSE_MOVE
    )
    this.handler.setInputAction(
      (event: unknown) => this.handleDoubleClick(event),
      Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK
    )
    this.handler.setInputAction(
      () => this.handleFinishRequest(),
      Cesium.ScreenSpaceEventType.RIGHT_CLICK
    )
    this.handler.setInputAction(
      (event: unknown) => this.handleLeftDown(event),
      Cesium.ScreenSpaceEventType.LEFT_DOWN
    )
    this.handler.setInputAction(() => this.handleLeftUp(), Cesium.ScreenSpaceEventType.LEFT_UP)
  }

  private handleClick(event: unknown): void {
    const session = this.active
    if (!session || session.state !== 'drawing') return
    const position = this.pickSurface((event as { position?: Cesium.Cartesian2 }).position)
    if (!position) return
    session.addPoint(position)
    this.requestRender()
  }

  private handleMouseMove(event: unknown): void {
    const screen = (event as { endPosition?: Cesium.Cartesian2 }).endPosition
    if (this.drag) {
      const position = this.pickSurface(screen)
      if (!position) return
      this.drag.session.updateDrag(position)
      this.requestRender()
      return
    }
    if (!this.active || this.active.state !== 'drawing') return
    const position = this.pickSurface(screen)
    if (!position) return
    this.active.setPreview(position)
    this.requestRender()
  }

  private handleDoubleClick(_event: unknown): void {
    if (!this.active || this.active.state !== 'drawing') return
    if (this.active.type !== 'polyline' && this.active.type !== 'polygon') return
    this.active.removeTrailingDuplicate()
    this.handleFinishRequest()
  }

  private handleFinishRequest(): void {
    if (!this.active || this.active.state !== 'drawing') return
    this.active.finish()
    this.requestRender()
  }

  private handleLeftDown(event: unknown): void {
    if (this.drag) return
    const screen = (event as { position?: Cesium.Cartesian2 }).position
    if (!screen || this.viewer.isDestroyed()) return
    let picked: unknown
    try {
      picked = this.viewer.scene.pick(screen)
    } catch {
      return
    }
    const entity = (picked as { id?: unknown } | undefined)?.id
    if (!(entity instanceof Cesium.Entity)) return

    for (let i = this.sessions.length - 1; i >= 0; i -= 1) {
      const session = this.sessions[i] as DrawSessionImpl
      if (!session.editable || session.state !== 'completed') continue
      const index = session.findHandle(entity.id)
      if (index === undefined) continue
      this.drag = { session, index }
      session.beginDrag(index)
      this.beginDragInputs()
      this.requestRender()
      return
    }
  }

  private handleLeftUp(): void {
    if (!this.drag) return
    this.drag.session.endDrag()
    this.drag = null
    this.endDragInputs()
    this.requestRender()
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return
    if (this.drag) {
      this.drag.session.endDrag()
      this.drag = null
      this.endDragInputs()
      return
    }
    if (this.active?.state === 'drawing') {
      this.active.cancel()
      return
    }
    this.sessions.forEach((session) => session.setEditable(false))
  }

  private pickSurface(screen?: Cesium.Cartesian2): Cesium.Cartesian3 | undefined {
    if (!screen || this.viewer.isDestroyed()) return undefined
    return this.coords.pickPosition(screen)?.position
  }

  private disablePick(): void {
    if (!this.pick || this.pickDisabledByDraw) return
    this.pickWasEnabled = this.pick.isEnabled()
    if (this.pickWasEnabled) this.pick.setEnabled(false)
    this.pickDisabledByDraw = true
  }

  private restorePick(): void {
    if (!this.pick || !this.pickDisabledByDraw) return
    this.pickDisabledByDraw = false
    this.pick.setEnabled(this.pickWasEnabled)
  }

  private restorePickSoon(): void {
    if (!this.pick || !this.pickDisabledByDraw) return
    if (this.restoreTimer !== null) clearTimeout(this.restoreTimer)
    this.restoreTimer = setTimeout(() => {
      this.restoreTimer = null
      this.restorePick()
    }, 0)
  }

  private beginDragInputs(): void {
    this.dragPickWasEnabled = this.pick?.isEnabled() ?? false
    if (this.dragPickWasEnabled) this.pick?.setEnabled(false)
    const controller = this.viewer.scene.screenSpaceCameraController
    if (controller) {
      this.cameraInputsWasEnabled = controller.enableInputs
      controller.enableInputs = false
    }
  }

  private endDragInputs(): void {
    const controller = this.viewer.scene.screenSpaceCameraController
    if (controller) controller.enableInputs = this.cameraInputsWasEnabled
    if (this.dragPickWasEnabled) {
      this.schedulePickEnable()
    }
  }

  private schedulePickEnable(): void {
    if (!this.pick) return
    if (this.restoreTimer !== null) clearTimeout(this.restoreTimer)
    this.restoreTimer = setTimeout(() => {
      this.restoreTimer = null
      this.pick?.setEnabled(true)
    }, 0)
  }
}

export function createDrawService(
  viewer: Cesium.Viewer,
  coords: CoordService,
  options?: import('./types').DrawServiceOptions
): DrawService {
  return new DrawService(viewer, coords, options)
}
