import type { WeatherLayerKind, WeatherLegend, WeatherScale } from './types'

export interface WeatherPalette {
  min: number
  max: number
  unit: string
  colors: string[]
  scale: WeatherScale
}

export const WEATHER_PALETTES: Record<WeatherLayerKind, WeatherPalette> = {
  precip: {
    min: 0,
    max: 30,
    unit: 'mm/h',
    scale: 'linear',
    colors: [
      'rgba(255, 255, 255, 0)',
      '#38bdf8',
      '#22d3ee',
      '#34d399',
      '#facc15',
      '#f97316',
      '#ef4444'
    ]
  },
  radar: {
    min: -10,
    max: 70,
    unit: 'dBZ',
    scale: 'linear',
    colors: ['#7c3aed', '#2563eb', '#06b6d4', '#22c55e', '#eab308', '#f97316', '#ef4444']
  },
  temperature: {
    min: -20,
    max: 45,
    unit: '°C',
    scale: 'linear',
    colors: ['#1d4ed8', '#38bdf8', '#a7f3d0', '#fde68a', '#fb923c', '#dc2626']
  },
  cloud: {
    min: 0,
    max: 100,
    unit: '%',
    scale: 'linear',
    colors: [
      'rgba(255, 255, 255, 0)',
      'rgba(255, 255, 255, 0.35)',
      'rgba(226, 232, 240, 0.65)',
      'rgba(148, 163, 184, 0.92)'
    ]
  },
  humidity: {
    min: 0,
    max: 100,
    unit: '%',
    scale: 'linear',
    colors: ['#b45309', '#84cc16', '#22c55e', '#06b6d4', '#2563eb']
  },
  pressure: {
    min: 950,
    max: 1050,
    unit: 'hPa',
    scale: 'linear',
    colors: ['#7c3aed', '#2563eb', '#22c55e', '#eab308', '#ef4444']
  }
}

export function paletteFor(kind: WeatherLayerKind): WeatherPalette {
  return WEATHER_PALETTES[kind]
}

export function legendFor(kind: WeatherLayerKind): WeatherLegend {
  const palette = paletteFor(kind)
  return {
    min: palette.min,
    max: palette.max,
    colors: palette.colors.slice(),
    unit: palette.unit
  }
}
