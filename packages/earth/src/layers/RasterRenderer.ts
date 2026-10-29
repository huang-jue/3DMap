import { paintRows, type RasterJob } from './rasterPixels'
import RasterWorker from './raster.worker?worker&inline'
/** One worker per active scalar layer; fallback yields between bounded row batches. */
export class RasterRenderer {
  private worker?: Worker
  private sequence = 0
  private destroyed = false
  private pending = new Map<
    number,
    { resolve: (bitmap: ImageBitmap) => void; reject: (error: unknown) => void }
  >()
  constructor() {
    if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
      try {
        this.worker = new RasterWorker()
        this.worker.onmessage = ({ data }) => {
          const task = this.pending.get(data.id)
          this.pending.delete(data.id)
          if (!task) data.bitmap?.close()
          else if (data.error) task.reject(new Error(data.error))
          else task.resolve(data.bitmap)
        }
        this.worker.onerror = () => {
          this.pending.forEach((task) => task.reject(new Error('栅格 Worker 不可用')))
          this.pending.clear()
          this.worker?.terminate()
          this.worker = undefined
        }
      } catch {
        /* browser/CSP fallback */
      }
    }
  }
  async render(job: RasterJob): Promise<string> {
    if (this.destroyed) throw new DOMException('已取消', 'AbortError')
    let bitmap: ImageBitmap | undefined
    if (this.worker) {
      try {
        const id = ++this.sequence
        bitmap = await new Promise<ImageBitmap>((resolve, reject) => {
          this.pending.set(id, { resolve, reject })
          this.worker!.postMessage({ id, job })
        })
      } catch {
        /* use chunked fallback */
      }
    }
    if (this.destroyed) {
      bitmap?.close()
      throw new DOMException('已取消', 'AbortError')
    }
    const target = document.createElement('canvas')
    target.width = job.targetWidth
    target.height = job.targetHeight
    const output = target.getContext('2d')
    if (!output) throw new Error('Canvas 2D 不可用')
    try {
      if (bitmap) output.drawImage(bitmap, 0, 0)
      else {
        const source = document.createElement('canvas')
        source.width = job.width
        source.height = job.height
        const context = source.getContext('2d')
        if (!context) throw new Error('Canvas 2D 不可用')
        const pixels = context.createImageData(job.width, job.height)
        const batch = Math.max(1, Math.floor(32_768 / job.width))
        for (let row = 0; row < job.height; row += batch) {
          if (this.destroyed) throw new DOMException('已取消', 'AbortError')
          paintRows(job, pixels.data, row, Math.min(job.height, row + batch))
          await new Promise((resolve) => setTimeout(resolve, 0))
        }
        context.putImageData(pixels, 0, 0)
        output.imageSmoothingEnabled = job.smooth
        output.drawImage(source, 0, 0, target.width, target.height)
      }
      const blob = await new Promise<Blob>((resolve, reject) =>
        target.toBlob(
          (value) => (value ? resolve(value) : reject(new Error('栅格编码失败'))),
          'image/png'
        )
      )
      if (this.destroyed) throw new DOMException('已取消', 'AbortError')
      return URL.createObjectURL(blob)
    } finally {
      bitmap?.close()
      target.width = target.height = 0
    }
  }
  destroy(): void {
    this.destroyed = true
    this.worker?.terminate()
    this.pending.forEach((task) => task.reject(new DOMException('已取消', 'AbortError')))
    this.pending.clear()
  }
}
