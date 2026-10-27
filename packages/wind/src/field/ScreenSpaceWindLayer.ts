import * as Cesium from 'cesium'
import type { WindGrid } from '../shared/types'
import type { WindFieldLayerOptions } from './WindFieldLayer'
import { advectWind } from './advection'

interface Particle {
  lon: number
  lat: number
  age: number
}

/** Persistent screen-space trails projected through Cesium in 2D and 3D.
 * Animation is driven by postRender; no independent timer or extra WebGL context.
 * Data changes preserve particles. Camera movement clears old screen coordinates.
 */
export class ScreenSpaceWindLayer {
  private readonly canvas = document.createElement('canvas')
  private readonly context: CanvasRenderingContext2D
  private readonly occluder: Cesium.EllipsoidalOccluder
  private particles: Particle[] = []
  private lastFrame = 0
  private removed = false
  private visible = true
  private moving = false
  private cleanups: Array<() => void> = []
  private width = 0
  private height = 0
  private painted = false
  private readonly point = new Cesium.Cartesian3()
  private readonly screen = new Cesium.Cartesian2()
  private readonly pick = new Cesium.Cartesian2()

  constructor(
    private readonly viewer: Cesium.Viewer,
    private grid: WindGrid,
    private options: WindFieldLayerOptions
  ) {
    const context = this.canvas.getContext('2d')
    if (!context) throw new Error('Wind trails: Canvas 2D unavailable')
    this.context = context
    this.occluder = new Cesium.EllipsoidalOccluder(
      viewer.scene.globe.ellipsoid,
      viewer.camera.positionWC
    )
    this.canvas.className = 'earth-wind-trails'
    this.canvas.setAttribute('aria-hidden', 'true')
    this.canvas.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;'
    viewer.scene.canvas.parentElement?.appendChild(this.canvas)
    this.cleanups = [
      viewer.scene.postRender.addEventListener(() => this.draw()),
      viewer.camera.moveStart.addEventListener(() => {
        this.moving = true
        this.clear()
      }),
      viewer.camera.moveEnd.addEventListener(() => {
        this.moving = false
        this.reset()
      }),
      viewer.scene.morphStart.addEventListener(() => {
        this.moving = true
        this.clear()
      }),
      viewer.scene.morphComplete.addEventListener(() => {
        this.moving = false
        this.reset()
      })
    ]
  }

  get show() {
    return this.visible
  }
  set show(value: boolean) {
    this.visible = value
    this.canvas.style.display = value ? '' : 'none'
  }
  updateWindData(grid: WindGrid) {
    this.grid = grid
  }
  updateOptions(options: WindFieldLayerOptions) {
    this.options = { ...this.options, ...options }
    this.reset()
  }
  zoomTo(duration = 0) {
    const b = this.grid.bounds
    void this.viewer.camera.flyTo({
      destination: Cesium.Rectangle.fromDegrees(b.west, b.south, b.east, b.north),
      duration
    })
  }
  destroy() {
    if (this.removed) return
    this.removed = true
    this.cleanups.forEach((off) => off())
    this.cleanups = []
    this.canvas.remove()
    this.particles = []
  }

  private clear() {
    this.context.clearRect(0, 0, this.width, this.height)
  }
  private reset() {
    this.clear()
    this.particles = []
    this.lastFrame = 0
    this.painted = false
  }
  private seed(): Particle {
    // Seed in the visible viewport; zooming no longer wastes most particles on
    // the opposite side of the globe. Ellipsoid picking also works in 2D.
    for (let attempt = 0; attempt < 8; attempt++) {
      this.pick.x = Math.random() * this.width
      this.pick.y = Math.random() * this.height
      const position = this.viewer.camera.pickEllipsoid(
        this.pick,
        this.viewer.scene.globe.ellipsoid
      )
      if (!position) continue
      const c = Cesium.Cartographic.fromCartesian(position)
      const lon = Cesium.Math.toDegrees(c.longitude)
      const lat = Cesium.Math.toDegrees(c.latitude)
      const b = this.grid.bounds
      if (lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north)
        return { lon, lat, age: Math.random() * 3 }
    }
    const b = this.grid.bounds
    return {
      lon: b.west + Math.random() * (b.east - b.west),
      lat: b.south + Math.random() * (b.north - b.south),
      age: 5
    }
  }
  private project(lon: number, lat: number): { x: number; y: number } | null {
    Cesium.Cartesian3.fromDegrees(
      lon,
      lat,
      this.options.particleHeight ?? 100,
      this.viewer.scene.globe.ellipsoid,
      this.point
    )
    if (
      this.viewer.scene.mode === Cesium.SceneMode.SCENE3D &&
      !this.occluder.isPointVisible(this.point)
    )
      return null
    const p = Cesium.SceneTransforms.worldToWindowCoordinates(
      this.viewer.scene,
      this.point,
      this.screen
    )
    return p && p.x >= 0 && p.x <= this.width && p.y >= 0 && p.y <= this.height
      ? { x: p.x, y: p.y }
      : null
  }
  private draw() {
    if (
      this.removed ||
      !this.visible ||
      this.moving ||
      this.viewer.scene.mode === Cesium.SceneMode.MORPHING
    )
      return
    const now = performance.now()
    const elapsed = (now - this.lastFrame) / 1000
    if (elapsed < 1 / 30) return
    const dt = Math.min(0.06, elapsed || 1 / 30)
    this.lastFrame = now
    const width = this.viewer.scene.canvas.clientWidth
    const height = this.viewer.scene.canvas.clientHeight
    if (width !== this.width || height !== this.height) {
      this.width = width
      this.height = height
      const ratio = Math.min(2, window.devicePixelRatio || 1)
      this.canvas.width = Math.round(width * ratio)
      this.canvas.height = Math.round(height * ratio)
      this.context.setTransform(ratio, 0, 0, ratio, 0, 0)
      this.particles = []
      this.painted = false
    }
    const count = Math.min(
      5500,
      Math.max(
        600,
        Math.round((((width * height) / 350) * (this.options.particlesTextureSize ?? 128)) / 128)
      )
    )
    while (this.particles.length < count) this.particles.push(this.seed())
    if (this.particles.length > count) this.particles.length = count
    if (this.options.dynamic === false && this.painted) return
    this.occluder.cameraPosition = this.viewer.camera.positionWC
    const ctx = this.context
    ctx.globalCompositeOperation = 'destination-in'
    ctx.fillStyle = `rgba(0,0,0,${Math.exp(-dt * 1.5)})`
    ctx.fillRect(0, 0, width, height)
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = this.options.colors?.[0] ?? '#d6f9ed'
    ctx.lineWidth = this.options.lineWidth?.min ?? 0.9
    ctx.globalAlpha = 0.78
    ctx.beginPath()
    const seconds = dt * 18_000 * (this.options.speedFactor ?? 1.5)
    for (let i = 0; i < this.particles.length; i++) {
      let particle = this.particles[i]!
      if (particle.age > 4.5) particle = this.particles[i] = this.seed()
      const start = this.project(particle.lon, particle.lat)
      const next = advectWind(this.grid, particle.lon, particle.lat, seconds)
      const end = next ? this.project(next.lon, next.lat) : null
      if (!next || !start || !end || Math.hypot(end.x - start.x, end.y - start.y) > 35) {
        particle.age = 5
        continue
      }
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      particle.lon = next.lon
      particle.lat = next.lat
      particle.age += dt
    }
    ctx.stroke()
    ctx.globalAlpha = 1
    this.painted = true
  }
}
