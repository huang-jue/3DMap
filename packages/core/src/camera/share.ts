import type { CameraView } from '../types'

const PREFIX = '#map='

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

/** 把相机视角编码为 URL hash，例如 `#map=116.3913,39.9075,5000,0,-45,0`。 */
export function encodeCameraState(state: CameraView | Omit<CameraView, 'roll'>): string {
  const roll = 'roll' in state ? state.roll : 0
  const values = [state.lon, state.lat, state.height, state.heading, state.pitch, roll].map(
    round
  )
  return `${PREFIX}${values.join(',')}`
}

/** 从 URL 或 hash 中解析相机视角；格式不合法时返回 null。 */
export function decodeCameraState(input: string): CameraView | null {
  if (!input) return null
  const markerIndex = input.indexOf('#map=')
  const raw = markerIndex >= 0 ? input.slice(markerIndex + PREFIX.length) : input.replace(/^#?map=/, '')
  const parts = raw.split(',').map((part) => Number(part.trim()))
  if (parts.length < 5 || parts.some((value) => !Number.isFinite(value))) return null
  const [lon, lat, height, heading, pitch, roll = 0] = parts
  return { lon, lat, height, heading, pitch, roll }
}

/** 生成带相机状态的分享链接；未传 baseUrl 时返回可拼接到当前地址的 hash。 */
export function buildShareUrl(state: CameraView, baseUrl?: string): string {
  const encoded = encodeCameraState(state)
  if (!baseUrl) return encoded
  return `${baseUrl.split('#')[0]}${encoded}`
}
