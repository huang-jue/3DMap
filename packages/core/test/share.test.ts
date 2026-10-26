import { describe, expect, it } from 'vitest'
import { buildShareUrl, decodeCameraState, encodeCameraState } from '../src/camera/share'
import type { CameraView } from '../src/types'

const view: CameraView = {
  lon: 116.3913,
  lat: 39.9075,
  height: 5000,
  heading: 12.5,
  pitch: -45,
  roll: 0
}

describe('相机视角分享', () => {
  it('编码为 hash', () => {
    expect(encodeCameraState(view)).toBe('#map=116.3913,39.9075,5000,12.5,-45,0')
  })

  it('编码后再解码保持一致', () => {
    expect(decodeCameraState(encodeCameraState(view))).toEqual(view)
  })

  it('可从完整 URL 中解析', () => {
    const url = `https://example.com/app?a=1${encodeCameraState(view)}`
    expect(decodeCameraState(url)).toEqual(view)
  })

  it('支持缺少 roll 的旧格式', () => {
    expect(decodeCameraState('#map=1,2,3,4,5')).toEqual({
      lon: 1,
      lat: 2,
      height: 3,
      heading: 4,
      pitch: 5,
      roll: 0
    })
  })

  it('非法输入返回 null', () => {
    expect(decodeCameraState('')).toBeNull()
    expect(decodeCameraState('#map=1,2')).toBeNull()
    expect(decodeCameraState('#map=1,2,3,4,abc')).toBeNull()
  })

  it('生成分享链接时保留 baseUrl 并替换 hash', () => {
    expect(buildShareUrl(view, 'https://example.com/app#old')).toBe(
      `https://example.com/app${encodeCameraState(view)}`
    )
    expect(buildShareUrl(view)).toBe(encodeCameraState(view))
  })
})
