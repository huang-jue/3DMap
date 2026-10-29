export interface RasterJob {
  width: number
  height: number
  targetWidth: number
  targetHeight: number
  values: Float32Array | number[]
  colors: Uint8ClampedArray
  min: number
  max: number
  noData?: number
  extraNoData?: number
  log: boolean
  smooth: boolean
}
export function paintRows(
  job: RasterJob,
  pixels: Uint8ClampedArray,
  from: number,
  to: number
): void {
  const { width, height, min, max } = job
  const lo = job.log ? Math.log(Math.max(0.0001, min)) : min
  const hi = job.log ? Math.log(Math.max(Math.max(0.0001, min) + 0.0001, max)) : max
  for (let y = from; y < to; y++)
    for (let x = 0; x < width; x++) {
      const value = job.values[y * width + x]!
      const offset = ((height - 1 - y) * width + x) * 4
      if (!Number.isFinite(value) || value === job.noData || value === job.extraNoData) continue
      const normalized =
        ((job.log ? Math.log(Math.max(Math.max(0.0001, min), value)) : value) - lo) / (hi - lo || 1)
      const index = Math.round(Math.max(0, Math.min(1, normalized)) * 4095) * 4
      pixels.set(job.colors.subarray(index, index + 4), offset)
    }
}
