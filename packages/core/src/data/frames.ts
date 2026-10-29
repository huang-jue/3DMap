import { sharedDataRepository, type DataRequestOptions } from './DataRepository'
export interface FrameSource<T> {
  times: Date[]
  getFrame(index: number, options?: DataRequestOptions): Promise<T>
}
export async function readFloatBinary(
  url: string,
  count: number,
  signal?: AbortSignal
): Promise<Float32Array> {
  let buffer = await (await sharedDataRepository.request(url, signal)).arrayBuffer()
  const bytes = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength))
  if (bytes[0] === 31 && bytes[1] === 139) {
    buffer = await new Response(
      new Response(buffer).body!.pipeThrough(new DecompressionStream('gzip'))
    ).arrayBuffer()
  }
  signal?.throwIfAborted()
  if (buffer.byteLength !== count * 4) throw new Error('二进制网格长度不匹配 (length mismatch)')
  return new Float32Array(buffer)
}
export function dataUrl(url: string, base: string): string {
  return new URL(
    url,
    new URL(base, typeof location === 'undefined' ? 'http://localhost/' : location.href)
  ).href
}
