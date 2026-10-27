import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUTPUT_DIR = fileURLToPath(new URL('../apps/playground/public/data/earth/', import.meta.url))

const BOUNDS = { west: -180, south: -80, east: 180, north: 80 }
const WIDTH = 48
const HEIGHT = 24
const START = Date.parse('2026-07-01T00:00:00.000Z')
const FRAME_COUNT = 4
const STEP_HOURS = 6

const round = (value, digits = 2) => {
  const base = 10 ** digits
  return Math.round(value * base) / base
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

function timeAt(index) {
  return new Date(START + index * STEP_HOURS * 3600_000)
}

function gauss(x, y, cx, cy, sx, sy) {
  const dx = (x - cx) / sx
  const dy = (y - cy) / sy
  return Math.exp(-(dx * dx + dy * dy))
}

function writeFile(path, data) {
  const full = `${OUTPUT_DIR}${path}`
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

const BLUE_RED = ['#1d4ed8', '#38bdf8', '#a7f3d0', '#fde68a', '#fb923c', '#dc2626']
const GREEN_BLUE = ['#b45309', '#84cc16', '#22c55e', '#06b6d4', '#2563eb']
const PURPLE_RED = ['#7c3aed', '#2563eb', '#06b6d4', '#22c55e', '#eab308', '#f97316', '#ef4444']
const WHITE_GRAY = [
  'rgba(255,255,255,0)',
  'rgba(255,255,255,0.35)',
  'rgba(226,232,240,0.65)',
  'rgba(148,163,184,0.9)'
]

const OVERLAYS = [
  {
    mode: 'atmosphere',
    id: 'temperature',
    label: '温度',
    unit: '°C',
    min: -40,
    max: 45,
    colors: BLUE_RED,
    seed: 1
  },
  {
    mode: 'atmosphere',
    id: 'humidity',
    label: '相对湿度',
    unit: '%',
    min: 0,
    max: 100,
    colors: GREEN_BLUE,
    seed: 2
  },
  {
    mode: 'atmosphere',
    id: 'dewpoint',
    label: '露点温度',
    unit: '°C',
    min: -30,
    max: 30,
    colors: BLUE_RED,
    seed: 3
  },
  {
    mode: 'atmosphere',
    id: 'wetbulb',
    label: '湿球温度',
    unit: '°C',
    min: -30,
    max: 30,
    colors: BLUE_RED,
    seed: 4
  },
  {
    mode: 'atmosphere',
    id: 'precip3h',
    label: '3 小时降水',
    unit: 'mm',
    min: 0,
    max: 50,
    colors: BLUE_RED,
    seed: 5
  },
  {
    mode: 'atmosphere',
    id: 'cape',
    label: '对流有效位能',
    unit: 'J/kg',
    min: 0,
    max: 4000,
    colors: PURPLE_RED,
    seed: 6
  },
  {
    mode: 'atmosphere',
    id: 'precipitable-water',
    label: '水汽含量',
    unit: 'mm',
    min: 0,
    max: 70,
    colors: GREEN_BLUE,
    seed: 7
  },
  {
    mode: 'atmosphere',
    id: 'cloud-water',
    label: '云中总水量',
    unit: 'g/m²',
    min: 0,
    max: 800,
    colors: WHITE_GRAY,
    seed: 8
  },
  {
    mode: 'atmosphere',
    id: 'mslp',
    label: '平均海平面气压',
    unit: 'hPa',
    min: 950,
    max: 1050,
    colors: PURPLE_RED,
    seed: 9
  },
  {
    mode: 'atmosphere',
    id: 'feels-like',
    label: '体感温度',
    unit: '°C',
    min: -40,
    max: 50,
    colors: BLUE_RED,
    seed: 10
  },
  {
    mode: 'atmosphere',
    id: 'uvi',
    label: '紫外线指数',
    unit: 'UVI',
    min: 0,
    max: 12,
    colors: PURPLE_RED,
    seed: 11
  },
  {
    mode: 'atmosphere',
    id: 'wpd',
    label: '风电功率密度',
    unit: 'W/m²',
    min: 0,
    max: 1200,
    colors: GREEN_BLUE,
    seed: 12
  },
  {
    mode: 'ocean',
    id: 'wave-period',
    label: '波峰周期',
    unit: 's',
    min: 0,
    max: 20,
    colors: GREEN_BLUE,
    seed: 13
  },
  {
    mode: 'ocean',
    id: 'wave-height',
    label: '有效波高',
    unit: 'm',
    min: 0,
    max: 10,
    colors: BLUE_RED,
    seed: 14
  },
  {
    mode: 'ocean',
    id: 'sst',
    label: '海面温度',
    unit: '°C',
    min: -2,
    max: 32,
    colors: BLUE_RED,
    seed: 15
  },
  {
    mode: 'ocean',
    id: 'sst-anomaly',
    label: '海温异常',
    unit: '°C',
    min: -5,
    max: 5,
    colors: PURPLE_RED,
    seed: 16
  },
  {
    mode: 'ocean',
    id: 'coral-bleaching',
    label: '珊瑚白化警报',
    unit: '%',
    min: 0,
    max: 100,
    colors: ['#22c55e', '#facc15', '#fb923c', '#ef4444'],
    seed: 17
  },
  {
    mode: 'chemistry',
    id: 'co',
    label: '一氧化碳',
    unit: 'ppb',
    min: 40,
    max: 400,
    colors: PURPLE_RED,
    seed: 18
  },
  {
    mode: 'chemistry',
    id: 'co2',
    label: '二氧化碳',
    unit: 'ppm',
    min: 380,
    max: 430,
    colors: BLUE_RED,
    seed: 19
  },
  {
    mode: 'chemistry',
    id: 'so2',
    label: '二氧化硫',
    unit: 'µg/m³',
    min: 0,
    max: 200,
    colors: PURPLE_RED,
    seed: 20
  },
  {
    mode: 'chemistry',
    id: 'no2',
    label: '二氧化氮',
    unit: 'µg/m³',
    min: 0,
    max: 200,
    colors: PURPLE_RED,
    seed: 21
  },
  {
    mode: 'particulate',
    id: 'dust',
    label: '沙尘消光',
    unit: 'AOD',
    min: 0,
    max: 3,
    colors: ['#fef3c7', '#fbbf24', '#f97316', '#dc2626'],
    seed: 22
  },
  {
    mode: 'particulate',
    id: 'pm1',
    label: 'PM1',
    unit: 'µg/m³',
    min: 0,
    max: 200,
    colors: PURPLE_RED,
    seed: 23
  },
  {
    mode: 'particulate',
    id: 'pm25',
    label: 'PM2.5',
    unit: 'µg/m³',
    min: 0,
    max: 300,
    colors: PURPLE_RED,
    seed: 24
  },
  {
    mode: 'particulate',
    id: 'pm10',
    label: 'PM10',
    unit: 'µg/m³',
    min: 0,
    max: 400,
    colors: PURPLE_RED,
    seed: 25
  },
  {
    mode: 'particulate',
    id: 'organic-aerosol',
    label: '有机气溶胶',
    unit: 'AOD',
    min: 0,
    max: 2,
    colors: PURPLE_RED,
    seed: 26
  },
  {
    mode: 'particulate',
    id: 'sulfate-extinction',
    label: '硫酸盐消光',
    unit: 'AOD',
    min: 0,
    max: 2,
    colors: PURPLE_RED,
    seed: 27
  },
  {
    mode: 'space',
    id: 'aurora',
    label: '极光概率',
    unit: '%',
    min: 0,
    max: 100,
    colors: ['rgba(255,255,255,0)', '#22d3ee', '#a855f7'],
    seed: 28
  },
  {
    mode: 'biology',
    id: 'coral',
    label: '珊瑚白化区域',
    unit: '%',
    min: 0,
    max: 100,
    colors: ['#22c55e', '#facc15', '#fb923c', '#ef4444'],
    seed: 29
  }
]

function overlayValue(overlay, lon, lat, frameIndex) {
  const t = frameIndex / Math.max(1, FRAME_COUNT - 1)
  const seed = overlay.seed
  if (overlay.id === 'aurora') {
    const north =
      gauss(lon, lat, -110 + t * 30, 68, 35, 9) + gauss(lon, lat, 80 - t * 20, 70, 28, 8)
    return round(clamp(north * 100, 0, 100), 1)
  }
  if (overlay.id === 'coral-bleaching' || overlay.id === 'coral') {
    const tropics = Math.exp(-((lat - 18 + Math.sin(lon / 12) * 8) ** 2) / 90)
    return round(clamp(tropics * (40 + 45 * Math.abs(Math.sin(lon / 18 + t * 2))), 0, 100), 1)
  }
  if (overlay.mode === 'atmosphere' && overlay.id === 'precip3h') {
    const rain = gauss(lon, lat, -40 + t * 40, 8 + Math.sin(t * 4) * 10, 22, 10)
    return rain < 0.08 ? -999 : round(clamp(rain * 45, 0, 50), 1)
  }
  const span = overlay.max - overlay.min
  const base = overlay.min + span * 0.52
  const wave =
    Math.sin((lon + seed * 11) / 20 + t * 2.2) * Math.cos((lat + seed * 7) / 14 - t * 1.4)
  const second = Math.sin((lon - seed * 5) / 9 - t * 0.8) * 0.35
  return round(clamp(base + span * (wave * 0.28 + second * 0.15), overlay.min, overlay.max), 2)
}

function writeScalar(overlay) {
  const frames = Array.from({ length: FRAME_COUNT }, (_, frameIndex) => {
    const values = []
    for (let y = 0; y < HEIGHT; y += 1) {
      const lat = BOUNDS.south + (y / (HEIGHT - 1)) * (BOUNDS.north - BOUNDS.south)
      for (let x = 0; x < WIDTH; x += 1) {
        const lon = BOUNDS.west + (x / (WIDTH - 1)) * (BOUNDS.east - BOUNDS.west)
        values.push(overlayValue(overlay, lon, lat, frameIndex))
      }
    }
    return {
      time: timeAt(frameIndex).toISOString(),
      bounds: BOUNDS,
      width: WIDTH,
      height: HEIGHT,
      noData: -999,
      values
    }
  })
  const data = {
    frames,
    legend: {
      min: overlay.min,
      max: overlay.max,
      unit: overlay.unit,
      colors: overlay.colors
    }
  }
  const path = `${overlay.mode}/${overlay.id}.json`
  writeFile(path, data)
  return `/data/earth/${path}`
}

function writeVector(mode, id, label, unit, particleHeight, speedFactor, colors, seed) {
  const grids = Array.from({ length: FRAME_COUNT }, (_, frameIndex) => {
    const u = []
    const v = []
    for (let y = 0; y < HEIGHT; y += 1) {
      const lat = BOUNDS.south + (y / (HEIGHT - 1)) * (BOUNDS.north - BOUNDS.south)
      for (let x = 0; x < WIDTH; x += 1) {
        const lon = BOUNDS.west + (x / (WIDTH - 1)) * (BOUNDS.east - BOUNDS.west)
        const phase = frameIndex * 0.75 + seed
        const base = id === 'currents' ? 1.8 : id === 'waves' ? 4 : 12
        const latWave = Math.cos(((lat + 10) / 180) * Math.PI)
        u.push(round((Math.sin(lon / 22 + phase) + 0.4 * Math.cos(lat / 11 - phase)) * base, 2))
        v.push(
          round((Math.cos(lon / 17 - phase) + 0.5 * Math.sin(lat / 9 + phase)) * base * latWave, 2)
        )
      }
    }
    return {
      u,
      v,
      width: WIDTH,
      height: HEIGHT,
      bounds: BOUNDS,
      refTime: timeAt(frameIndex).toISOString()
    }
  })
  const path = `${mode}/${id}.json`
  writeFile(path, grids)
  return {
    id,
    label,
    unit,
    data: `/data/earth/${path}`,
    particleHeight,
    speedFactor,
    colors
  }
}

const overlayConfigs = {}
for (const overlay of OVERLAYS) {
  const data = writeScalar(overlay)
  overlayConfigs[overlay.id] = {
    id: overlay.id,
    label: overlay.label,
    unit: overlay.unit,
    min: overlay.min,
    max: overlay.max,
    colors: overlay.colors,
    data
  }
}

const wind = writeVector('atmosphere', 'wind', '风', 'm/s', 50000, 1.5, ['#ffffff'], 1)
const currents = writeVector('ocean', 'currents', '洋流', 'm/s', 1000, 1.2, ['#38bdf8'], 2)
const waves = writeVector('ocean', 'waves', '波浪', 'm', 3000, 1.2, ['#a5f3fc'], 3)

const modes = [
  {
    id: 'atmosphere',
    label: '大气',
    vectors: [wind],
    overlays: [
      'temperature',
      'humidity',
      'dewpoint',
      'wetbulb',
      'precip3h',
      'cape',
      'precipitable-water',
      'cloud-water',
      'mslp',
      'feels-like',
      'uvi',
      'wpd'
    ].map((id) => overlayConfigs[id]),
    defaultVector: 'wind',
    defaultOverlay: 'temperature',
    defaultAnnotations: ['fires']
  },
  {
    id: 'ocean',
    label: '海洋',
    vectors: [currents, waves],
    overlays: ['wave-period', 'wave-height', 'sst', 'sst-anomaly', 'coral-bleaching'].map(
      (id) => overlayConfigs[id]
    ),
    defaultVector: 'currents',
    defaultOverlay: 'sst',
    defaultAnnotations: ['coral']
  },
  {
    id: 'chemistry',
    label: '化学',
    vectors: [],
    overlays: ['co', 'co2', 'so2', 'no2'].map((id) => overlayConfigs[id]),
    defaultOverlay: 'co2'
  },
  {
    id: 'particulate',
    label: '颗粒物',
    vectors: [],
    overlays: ['dust', 'pm1', 'pm25', 'pm10', 'organic-aerosol', 'sulfate-extinction'].map(
      (id) => overlayConfigs[id]
    ),
    defaultOverlay: 'pm25'
  },
  {
    id: 'space',
    label: '空间天气',
    vectors: [],
    overlays: [overlayConfigs.aurora],
    defaultOverlay: 'aurora',
    defaultAnnotations: ['aurora']
  },
  {
    id: 'biology',
    label: '生物',
    vectors: [],
    overlays: [overlayConfigs.coral],
    defaultOverlay: 'coral',
    defaultAnnotations: ['coral']
  }
]

writeFile('annotations/fires.geojson', {
  type: 'FeatureCollection',
  features: [
    [-120, 38, '加州山火', 'high'],
    [-60, -8, '亚马逊火点', 'medium'],
    [20, 0, '刚果火点', 'medium'],
    [135, -25, '澳洲火点', 'high'],
    [110, 25, '华南火点', 'low'],
    [80, 55, '西伯利亚火点', 'medium'],
    [-150, 62, '阿拉斯加火点', 'low'],
    [30, 40, '地中海火点', 'medium']
  ].map(([lon, lat, name, level], index) => ({
    type: 'Feature',
    properties: { id: `fire-${index}`, name, level },
    geometry: { type: 'Point', coordinates: [lon, lat] }
  }))
})

writeFile('annotations/aurora.geojson', {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 'aurora-north', name: '北半球极光区' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-160, 62],
            [-80, 62],
            [-40, 72],
            [-120, 76],
            [-160, 62]
          ]
        ]
      }
    },
    {
      type: 'Feature',
      properties: { id: 'aurora-south', name: '南半球极光区' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-180, -65],
            [-60, -65],
            [-20, -75],
            [-160, -78],
            [-180, -65]
          ]
        ]
      }
    }
  ]
})

writeFile('annotations/coral.geojson', {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 'coral-pacific', name: '太平洋珊瑚白化区' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [150, -20],
            [180, -20],
            [180, 5],
            [150, 5],
            [150, -20]
          ]
        ]
      }
    },
    {
      type: 'Feature',
      properties: { id: 'coral-caribbean', name: '加勒比珊瑚白化区' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-85, 12],
            [-60, 12],
            [-60, 25],
            [-85, 25],
            [-85, 12]
          ]
        ]
      }
    }
  ]
})

writeFile('manifest.json', {
  name: '全球地球可视化样例',
  source: 'Static synthetic demo',
  range: { start: timeAt(0).toISOString(), end: timeAt(FRAME_COUNT - 1).toISOString() },
  bounds: BOUNDS,
  modes,
  annotations: [
    { id: 'fires', label: '火点', type: 'points', data: '/data/earth/annotations/fires.geojson' },
    {
      id: 'aurora',
      label: '极光',
      type: 'polygons',
      data: '/data/earth/annotations/aurora.geojson'
    },
    {
      id: 'coral',
      label: '珊瑚白化',
      type: 'polygons',
      data: '/data/earth/annotations/coral.geojson'
    }
  ],
  weather: {
    sample: true,
    points: '/data/weather/cities.json',
    warnings: '/data/weather/warnings.geojson',
    windFarm: '/data/turbines.json'
  }
})

console.log(`[earth] 已生成样例数据：${OUTPUT_DIR}manifest.json`)
