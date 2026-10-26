import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OUTPUT_DIR = fileURLToPath(
  new URL('../apps/playground/public/data/weather/', import.meta.url)
)

const BOUNDS = { west: 100, south: 20, east: 130, north: 40 }
const WIDTH = 48
const HEIGHT = 32
const START = Date.parse('2026-07-01T00:00:00.000Z')
const STEP_HOURS = 6
const FRAME_COUNT = 13

const PALETTES = {
  precip: {
    min: 0,
    max: 30,
    unit: 'mm/h',
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
    colors: ['#7c3aed', '#2563eb', '#06b6d4', '#22c55e', '#eab308', '#f97316', '#ef4444']
  },
  temperature: {
    min: -20,
    max: 45,
    unit: '°C',
    colors: ['#1d4ed8', '#38bdf8', '#a7f3d0', '#fde68a', '#fb923c', '#dc2626']
  },
  cloud: {
    min: 0,
    max: 100,
    unit: '%',
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
    colors: ['#b45309', '#84cc16', '#22c55e', '#06b6d4', '#2563eb']
  }
}

const LAYER_META = [
  { kind: 'precip', name: '降水', file: 'precip.json', defaultAlpha: 0.78, defaultVisible: true },
  { kind: 'radar', name: '雷达回波', file: 'radar.json', defaultAlpha: 0.72, defaultVisible: false },
  { kind: 'temperature', name: '温度', file: 'temperature.json', defaultAlpha: 0.62, defaultVisible: false },
  { kind: 'cloud', name: '云量', file: 'cloud.json', defaultAlpha: 0.55, defaultVisible: false },
  { kind: 'humidity', name: '湿度', file: 'humidity.json', defaultAlpha: 0.58, defaultVisible: false }
]

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function round(value, digits = 1) {
  const base = 10 ** digits
  return Math.round(value * base) / base
}

function lonAt(x) {
  return BOUNDS.west + (x / (WIDTH - 1)) * (BOUNDS.east - BOUNDS.west)
}

function latAt(y) {
  return BOUNDS.south + (y / (HEIGHT - 1)) * (BOUNDS.north - BOUNDS.south)
}

function gauss(x, y, cx, cy, sx, sy) {
  const dx = (x - cx) / sx
  const dy = (y - cy) / sy
  return Math.exp(-(dx * dx + dy * dy))
}

function valueFor(kind, lon, lat, frameIndex) {
  const t = frameIndex / Math.max(1, FRAME_COUNT - 1)
  const phase = t * Math.PI * 2

  if (kind === 'precip') {
    const centerLon = 104 + t * 20
    const centerLat = 29 + Math.sin(phase * 0.8) * 4
    const band = gauss(lon, lat, centerLon, centerLat, 5.5, 3.8)
    const cell = gauss(lon, lat, 116 + Math.sin(phase) * 3, 33, 3.2, 3.2)
    const value = 30 * band * (0.75 + 0.25 * Math.sin(phase * 1.7)) + 18 * cell
    return value < 0.4 ? -999 : round(clamp(value, 0, 30), 1)
  }

  if (kind === 'radar') {
    let value = -10
    for (let i = 0; i < 4; i += 1) {
      const cx = 106 + i * 6 + Math.sin(phase + i) * 2.5
      const cy = 27 + Math.cos(phase * 0.8 + i * 1.3) * 4
      value += 78 * gauss(lon, lat, cx, cy, 2.6 + i * 0.3, 2.2 + i * 0.2)
    }
    return value < -6 ? -999 : round(clamp(value, -10, 70), 0)
  }

  if (kind === 'temperature') {
    const latEffect = ((lat - BOUNDS.south) / (BOUNDS.north - BOUNDS.south)) * -18
    const daily = Math.sin(phase - Math.PI / 2) * 4
    const wave = Math.sin(lon / 5 + phase) * 1.6
    return round(clamp(28 + latEffect + daily + wave, -20, 45), 1)
  }

  if (kind === 'cloud') {
    let value = 8
    for (let i = 0; i < 3; i += 1) {
      const cx = 105 + i * 9 + t * 8
      const cy = 28 + Math.sin(phase + i * 1.6) * 5
      value += 34 * gauss(lon, lat, cx, cy, 4.5, 3.4)
    }
    return round(clamp(value, 0, 100), 0)
  }

  if (kind === 'humidity') {
    const value =
      62 +
      Math.sin(lon / 6 + phase * 0.9) * 18 +
      Math.cos(lat / 5 - phase * 0.7) * 12 +
      gauss(lon, lat, 116, 30, 7, 5) * 12
    return round(clamp(value, 0, 100), 0)
  }

  return 0
}

function buildLayer(meta) {
  const palette = PALETTES[meta.kind]
  const frames = []
  for (let frameIndex = 0; frameIndex < FRAME_COUNT; frameIndex += 1) {
    const values = []
    for (let y = 0; y < HEIGHT; y += 1) {
      const lat = latAt(y)
      for (let x = 0; x < WIDTH; x += 1) {
        values.push(valueFor(meta.kind, lonAt(x), lat, frameIndex))
      }
    }
    frames.push({
      time: new Date(START + frameIndex * STEP_HOURS * 3600_000).toISOString(),
      bounds: BOUNDS,
      width: WIDTH,
      height: HEIGHT,
      noData: -999,
      values
    })
  }

  return {
    kind: meta.kind,
    name: meta.name,
    unit: palette.unit,
    legend: palette,
    defaultVisible: meta.defaultVisible,
    defaultAlpha: meta.defaultAlpha,
    frames
  }
}

function buildCities() {
  const cities = [
    { id: 'wuhan', name: '武汉', lon: 114.3, lat: 30.6 },
    { id: 'beijing', name: '北京', lon: 116.4, lat: 39.9 },
    { id: 'shanghai', name: '上海', lon: 121.5, lat: 31.2 },
    { id: 'guangzhou', name: '广州', lon: 113.3, lat: 23.1 },
    { id: 'chengdu', name: '成都', lon: 104.1, lat: 30.6 }
  ]

  return {
    points: cities.map((city) => ({
      ...city,
      hourly: Array.from({ length: FRAME_COUNT }, (_, frameIndex) => {
        const time = new Date(START + frameIndex * STEP_HOURS * 3600_000)
        const temperature = round(26 + Math.sin((frameIndex / FRAME_COUNT) * Math.PI * 2) * 4, 1)
        return {
          time: time.toISOString(),
          temperature,
          precipitation: round(valueFor('precip', city.lon, city.lat, frameIndex), 1),
          humidity: round(valueFor('humidity', city.lon, city.lat, frameIndex), 0),
          windSpeed: round(3 + Math.abs(Math.sin(frameIndex * 0.8)) * 5, 1),
          windDirection: round((frameIndex * 32) % 360, 0),
          cloud: round(valueFor('cloud', city.lon, city.lat, frameIndex), 0),
          text: '多云'
        }
      })
    }))
  }
}

function buildWarnings() {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          id: 'warning-rain-01',
          type: '暴雨',
          level: 'yellow',
          title: '暴雨黄色预警',
          description: '未来 12 小时局地降雨量可达 50 毫米以上。',
          startTime: new Date(START).toISOString(),
          endTime: new Date(START + 12 * 3600_000).toISOString()
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [112.5, 29.2],
              [116.5, 29.2],
              [116.5, 32.2],
              [112.5, 32.2],
              [112.5, 29.2]
            ]
          ]
        }
      },
      {
        type: 'Feature',
        properties: {
          id: 'warning-thunder-01',
          type: '雷电',
          level: 'orange',
          title: '雷电橙色预警',
          description: '预计未来 6 小时内将出现强雷电活动。',
          startTime: new Date(START + 6 * 3600_000).toISOString(),
          endTime: new Date(START + 18 * 3600_000).toISOString()
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [117.5, 30.2],
              [121.5, 30.2],
              [121.5, 33.2],
              [117.5, 33.2],
              [117.5, 30.2]
            ]
          ]
        }
      }
    ]
  }
}

mkdirSync(OUTPUT_DIR, { recursive: true })

for (const meta of LAYER_META) {
  writeFileSync(
    `${OUTPUT_DIR}${meta.file}`,
    `${JSON.stringify(buildLayer(meta))}\n`,
    'utf8'
  )
}

writeFileSync(
  `${OUTPUT_DIR}manifest.json`,
  `${JSON.stringify({
    name: '长江流域天气预报样例',
    range: {
      start: new Date(START).toISOString(),
      end: new Date(START + (FRAME_COUNT - 1) * STEP_HOURS * 3600_000).toISOString()
    },
    layers: LAYER_META.map((meta) => ({
      ...meta,
      bounds: BOUNDS,
      width: WIDTH,
      height: HEIGHT,
      legend: PALETTES[meta.kind]
    }))
  })}\n`,
  'utf8'
)

writeFileSync(
  `${OUTPUT_DIR}cities.json`,
  `${JSON.stringify(buildCities())}\n`,
  'utf8'
)

writeFileSync(
  `${OUTPUT_DIR}warnings.geojson`,
  `${JSON.stringify(buildWarnings())}\n`,
  'utf8'
)

console.log(`[weather] 已生成样例数据：${OUTPUT_DIR}`)
