import { paintRows, type RasterJob } from './rasterPixels'
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<{ id: number; job: RasterJob }>) => void) | null
  postMessage(value: unknown, transfer?: Transferable[]): void
}
scope.onmessage = async ({ data: { id, job } }) => {
  try {
    const source = new OffscreenCanvas(job.width, job.height)
    const context = source.getContext('2d')!
    const pixels = context.createImageData(job.width, job.height)
    paintRows(job, pixels.data, 0, job.height)
    context.putImageData(pixels, 0, 0)
    const target = new OffscreenCanvas(job.targetWidth, job.targetHeight)
    const output = target.getContext('2d')!
    output.imageSmoothingEnabled = job.smooth
    output.drawImage(source, 0, 0, target.width, target.height)
    const bitmap = target.transferToImageBitmap()
    scope.postMessage({ id, bitmap }, [bitmap])
  } catch (error) {
    scope.postMessage({ id, error: String(error) })
  }
}
