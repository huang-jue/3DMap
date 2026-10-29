import type { EarthManifest, EarthMode, EarthProjection } from '@sgyx/cesium-kit-earth'

const modes: Record<string, EarthMode> = {
  air: 'atmosphere',
  ocean: 'ocean',
  chem: 'chemistry',
  particulates: 'particulate',
  space: 'space',
  bio: 'biology'
}
const overlays: Record<string, string> = {
  wind: 'wind-speed',
  temp: 'temperature',
  relative_humidity: 'humidity',
  dew_point_temp: 'dewpoint',
  wet_bulb_temp: 'wetbulb',
  precip_3hr: 'rain',
  total_precipitable_water: 'water',
  total_cloud_water: 'cloud',
  mean_sea_level_pressure: 'pressure',
  misery_index: 'feels-like',
  'pm2.5': 'pm25',
  duexttau: 'dust',
  suexttau: 'sulfate',
  organic_matter_aot: 'organic',
  sea_surface_temp: 'sst',
  sea_surface_temp_anomaly: 'sst-anomaly-oisst',
  significant_wave_height: 'wave-height',
  primary_waves: 'wave-period',
  bleaching_alert_area: 'coral',
  'uvo-1d_m': 'current-speed'
}

export function isEarthRoute(location: Pick<Location, 'search' | 'hash'>): boolean {
  return (
    new URLSearchParams(location.search).has('earth') ||
    /^#current\/(air|ocean|chem|particulates|space|bio)\//.test(location.hash)
  )
}

export function readEarthRoute(
  location: Pick<Location, 'search' | 'hash'>,
  manifest: EarthManifest
) {
  const query = new URLSearchParams(location.search).get('earth')
  const parts = location.hash.replace(/^#/, '').split('/')
  const rawOverlay = parts.find((p) => p.startsWith('overlay='))?.slice(8)
  const requested =
    modes[parts[1] ?? ''] ??
    (query === 'pm25'
      ? 'particulate'
      : query === 'co2sc' || query === 'co2'
        ? 'chemistry'
        : (modes[query ?? ''] ?? 'atmosphere'))
  const mode = manifest.modes.find((m) => m.id === requested) ?? manifest.modes[0]!
  const level =
    mode.levels?.find((l) => l.id === parts[2]) ??
    mode.levels?.find((l) => l.id === mode.defaultLevel) ??
    mode
  const mapped = rawOverlay ? (overlays[rawOverlay] ?? rawOverlay) : undefined
  const matchedOverlay = level.overlays.find(
    (o) =>
      o.id === mapped ||
      (rawOverlay === 'temp' && o.label === '温度') ||
      (rawOverlay === 'relative_humidity' && o.label === '相对湿度') ||
      (rawOverlay === 'wind' && o.label === '风速') ||
      (rawOverlay === 'wind_power_density' && o.label === '风电功率密度')
  )
  const overlay =
    rawOverlay === 'off'
      ? null
      : (matchedOverlay?.id ?? level.defaultOverlay ?? level.overlays[0]?.id ?? null)
  const animation = parts.find((p) => p.startsWith('anim='))?.slice(5)
  const vector = parts.includes('anim=off')
    ? null
    : (level.vectors.find((v) => v.id === animation)?.id ??
      level.defaultVector ??
      level.vectors[0]?.id ??
      null)
  const projection: EarthProjection = parts.includes('equirectangular')
    ? '2D'
    : parts.includes('perspective')
      ? '3D'
      : isEarthRoute(location)
        ? 'ORTHOGRAPHIC'
        : '3D'
  return { mode: mode.id, level: level.id, overlay, vector, projection }
}

export function writeEarthRoute(
  mode: EarthMode,
  level: string,
  overlay: string,
  vector: string,
  projection: EarthProjection
): void {
  const modeKey = Object.entries(modes).find(([, value]) => value === mode)?.[0] ?? 'air'
  const overlayKey = Object.entries(overlays).find(([, value]) => value === overlay)?.[0] ?? overlay
  const path = [
    'current',
    modeKey,
    level || 'surface',
    'level',
    ...(!vector ? ['anim=off'] : [`anim=${vector}`]),
    `overlay=${overlayKey || 'off'}`,
    projection === '2D'
      ? 'equirectangular'
      : projection === 'ORTHOGRAPHIC'
        ? 'orthographic'
        : 'perspective'
  ]
  history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}#${path.join('/')}`
  )
}
