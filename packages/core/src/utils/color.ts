import * as Cesium from 'cesium'
import type { ColorInput } from '../types'

export function toColor(input: ColorInput, fallback = Cesium.Color.WHITE): Cesium.Color {
  if (input instanceof Cesium.Color) return input
  try {
    return Cesium.Color.fromCssColorString(String(input))
  } catch {
    return fallback
  }
}
