import * as Cesium from 'cesium'

export function toCesiumColor(value: string): Cesium.Color {
  return Cesium.Color.fromCssColorString(value) ?? Cesium.Color.WHITE
}

export function sampleRamp(colors: Cesium.Color[], ratio: number): Cesium.Color {
  if (colors.length === 0) return Cesium.Color.WHITE
  if (colors.length === 1) return colors[0] as Cesium.Color
  const value = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0))
  const scaled = value * (colors.length - 1)
  const index = Math.floor(scaled)
  const next = Math.min(colors.length - 1, index + 1)
  const local = scaled - index
  const from = colors[index] as Cesium.Color
  const to = colors[next] as Cesium.Color
  return new Cesium.Color(
    from.red + (to.red - from.red) * local,
    from.green + (to.green - from.green) * local,
    from.blue + (to.blue - from.blue) * local,
    from.alpha + (to.alpha - from.alpha) * local
  )
}

export function toCssColor(color: Cesium.Color): string {
  const red = Math.round(Math.min(1, Math.max(0, color.red)) * 255)
  const green = Math.round(Math.min(1, Math.max(0, color.green)) * 255)
  const blue = Math.round(Math.min(1, Math.max(0, color.blue)) * 255)
  const alpha = Math.min(1, Math.max(0, color.alpha))
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}
