import { describe, expect, it } from 'vitest'
import {
  clampRange,
  findFrameIndexInRange,
  findNearestFrameIndex,
  framesRange,
  intersectRanges
} from '../src/data/time'
import type { WeatherFrame } from '../src/shared/types'

const bounds = { west: 0, south: 0, east: 1, north: 1 }

function frame(time: string): WeatherFrame {
  return {
    time: new Date(time),
    bounds,
    width: 2,
    height: 2,
    values: [0, 0, 0, 0]
  }
}

const frames = [
  frame('2026-07-01T00:00:00Z'),
  frame('2026-07-01T06:00:00Z'),
  frame('2026-07-01T12:00:00Z')
]

describe('weather time helpers', () => {
  it('计算帧范围', () => {
    const range = framesRange(frames)
    expect(range?.start.toISOString()).toBe('2026-07-01T00:00:00.000Z')
    expect(range?.end.toISOString()).toBe('2026-07-01T12:00:00.000Z')
  })

  it('找最近帧', () => {
    expect(findNearestFrameIndex(frames, new Date('2026-07-01T05:00:00Z'))).toBe(1)
    expect(findNearestFrameIndex(frames, new Date('2026-07-01T11:00:00Z'))).toBe(2)
    expect(findNearestFrameIndex([], new Date())).toBe(-1)
  })

  it('在可选范围内找帧并钳制时间', () => {
    const range = {
      start: new Date('2026-07-01T05:00:00Z'),
      end: new Date('2026-07-01T10:00:00Z')
    }
    expect(findFrameIndexInRange(frames, new Date('2026-07-01T00:00:00Z'), range)).toBe(1)
    expect(findFrameIndexInRange(frames, new Date('2026-07-01T23:00:00Z'), range)).toBe(1)
  })

  it('计算图层范围交集', () => {
    const range = intersectRanges([
      { frames: [frame('2026-07-01T00:00:00Z'), frame('2026-07-01T12:00:00Z')] },
      { frames: [frame('2026-07-01T06:00:00Z'), frame('2026-07-01T18:00:00Z')] }
    ])
    expect(range?.start.toISOString()).toBe('2026-07-01T06:00:00.000Z')
    expect(range?.end.toISOString()).toBe('2026-07-01T12:00:00.000Z')
  })

  it('把选择范围钳制到可用范围', () => {
    const range = clampRange(
      { start: new Date('2026-06-01T00:00:00Z'), end: new Date('2026-06-02T00:00:00Z') },
      { start: new Date('2026-07-01T00:00:00Z'), end: new Date('2026-07-02T00:00:00Z') }
    )
    expect(range.start.toISOString()).toBe('2026-07-01T00:00:00.000Z')
    expect(range.end.toISOString()).toBe('2026-07-01T00:00:00.000Z')
  })
})
