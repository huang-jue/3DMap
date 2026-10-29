import { afterEach, describe, expect, it, vi } from 'vitest'
import { RasterRenderer } from '../src/layers/RasterRenderer'
import type { RasterJob } from '../src/layers/rasterPixels'
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
describe('chunked raster fallback', () => {
  it('yields between row batches, creates a Blob URL and rejects work after destruction', async () => {
    vi.stubGlobal('Worker', undefined)
    const contexts: Array<{ putImageData: ReturnType<typeof vi.fn>; drawImage: ReturnType<typeof vi.fn> }> = []
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      const context = { createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }), putImageData: vi.fn(), drawImage: vi.fn(), imageSmoothingEnabled: false }
      contexts.push(context)
      return context as unknown as CanvasRenderingContext2D
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['raster'], { type:'image/png' })))
    const objectURL = vi.fn(() => 'blob:raster')
    vi.stubGlobal('URL', class extends URL { static override createObjectURL = objectURL })
    const colors = new Uint8ClampedArray(4096 * 4); colors.fill(255)
    const job: RasterJob = { width: 2, height: 2, targetWidth: 4, targetHeight: 4, values: [0,1,2,3], colors, min:0,max:3,log:false,smooth:true }
    const renderer = new RasterRenderer()
    const pending = renderer.render(job)
    expect(contexts[1]?.putImageData).not.toHaveBeenCalled()
    expect(await pending).toBe('blob:raster')
    expect(contexts[1]?.putImageData).toHaveBeenCalledOnce()
    expect(contexts[0]?.drawImage).toHaveBeenCalledOnce()
    expect(objectURL).toHaveBeenCalledOnce()
    renderer.destroy()
    await expect(renderer.render(job)).rejects.toMatchObject({ name:'AbortError' })
  })
})
