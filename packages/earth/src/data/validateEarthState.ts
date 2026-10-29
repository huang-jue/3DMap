import type { EarthPluginState } from '../shared/types'
export function validateEarthState(input: unknown): EarthPluginState {
  const state = input as EarthPluginState
  if (
    !state ||
    state.version !== 1 ||
    typeof state.dataRef !== 'string' ||
    !state.dataRef ||
    !['atmosphere', 'ocean', 'chemistry', 'particulate', 'space', 'biology'].includes(state.mode) ||
    typeof state.level !== 'string' ||
    !state.level ||
    !['overlay', 'vector'].every(
      (key) =>
        state[key as 'overlay' | 'vector'] === null ||
        typeof state[key as 'overlay' | 'vector'] === 'string'
    ) ||
    !Array.isArray(state.annotations) ||
    !state.annotations.every((id) => typeof id === 'string') ||
    !state.weather ||
    !['points', 'warnings', 'windFarm'].every(
      (key) => typeof state.weather[key as keyof typeof state.weather] === 'boolean'
    ) ||
    !['ORTHOGRAPHIC', '3D', '2D', 'COLUMBUS_VIEW'].includes(state.projection) ||
    typeof state.followClock !== 'boolean'
  )
    throw new Error('非法地球状态')
  const settings = state.settings
  if (
    !settings ||
    !['grid', 'hd', 'dynamic', 'infoBar', 'bold'].every(
      (key) => typeof settings[key as keyof typeof settings] === 'boolean'
    ) ||
    !['nearest', 'bilinear'].includes(settings.interpolation) ||
    !['small', 'normal', 'large'].includes(settings.fontScale)
  )
    throw new Error('非法地球显示设置')
  for (const [key, min, max] of [
    ['flowDensity', 16, 512],
    ['flowSpeed', 0, 10],
    ['overlayAlpha', 0, 1]
  ] as const) {
    const value = settings[key]
    if (value !== undefined && (!Number.isFinite(value) || value < min || value > max))
      throw new Error(`非法地球设置 ${key}`)
  }
  return state
}
