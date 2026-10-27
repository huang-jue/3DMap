import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { decodeEpak } from './earth/decode-epak.mjs'
import { importPm25 } from './earth/import-pm25.mjs'

const root = new URL('../apps/playground/public/data/earth/real/', import.meta.url)
const rawFiles = ['wind-current.epak', 'wind-0300.epak', 'wind-0600.epak']
const sourceRoot = 'https://gaia.nullschool.net/data/gfs/'
const paths = [
  'current/current-wind-surface-level-gfs-0.5.epak',
  '2026/10/27/0300-wind-surface-level-gfs-0.5.epak',
  '2026/10/27/0600-wind-surface-level-gfs-0.5.epak'
]
const bounds = { west: -180, south: -90, east: 180, north: 90 }
const colors = [
  '#24144c',
  '#234b88',
  '#247eb0',
  '#28aba5',
  '#6bc570',
  '#d6da52',
  '#eea53d',
  '#e35d35',
  '#a92153'
]
const legend = { min: 0, max: 35, unit: 'm/s', colors }
const records = []
const provenance = []
mkdirSync(fileURLToPath(root), { recursive: true })
for (const [index, file] of rawFiles.entries()) {
  const raw = readFileSync(new URL(`raw/${file}`, root))
  const { header, blocks } = decodeEpak(raw)
  const variables = header.variables
  const lon = variables.lon.sequence
  const lat = variables.lat.sequence
  if (
    lon.start !== 0 ||
    lon.delta !== 0.5 ||
    lon.size !== 720 ||
    lat.start !== 90 ||
    lat.delta !== -0.5 ||
    lat.size !== 361
  )
    throw new Error('Unexpected snapshot grid')
  const uVar = Object.values(variables).find((v) => v.long_name === 'U-component of wind')
  const vVar = Object.values(variables).find((v) => v.long_name === 'V-component of wind')
  const component = (variable) => {
    const block = blocks[variable?.data?.block]
    if (!block || block.cols !== 720 || block.rows !== 361 || block.grids !== 1)
      throw new Error('Invalid wind component')
    const values = []
    // Rotate 0…359.5 to -180…179.5, flip north-first to south-first,
    // append a duplicate endpoint at +180 so bilinear sampling is continuous.
    for (let y = 0; y < 361; y++) {
      for (let x = 0; x <= 720; x++) {
        const value = block.values[(360 - y) * 720 + ((x + 360) % 720)]
        if (!Number.isFinite(value) || Math.abs(value) > 150)
          throw new Error('Invalid GFS wind value')
        values.push(Math.round(value * 10) / 10)
      }
    }
    return values
  }
  const refTime = new Date(variables.time.data[0]).toISOString()
  records.push({ refTime, width: 721, height: 361, bounds, u: component(uVar), v: component(vVar) })
  provenance.push({
    file: `raw/${file}`,
    url: sourceRoot + paths[index],
    sha256: createHash('sha256').update(raw).digest('hex'),
    validTime: refTime,
    modelRun: variables.time['init-time'],
    level: '10 m above ground',
    grid: '0.5° (720 × 361 source; 721 × 361 with duplicate longitude endpoint)',
    institution: header.institution,
    history: header.history
  })
}
records.sort((a, b) => Date.parse(a.refTime) - Date.parse(b.refTime))
if (new Set(records.map((r) => r.refTime)).size !== records.length)
  throw new Error('Duplicate snapshot times')
const write = (name, data) => writeFileSync(new URL(name, root), JSON.stringify(data) + '\n')
const pm25 = importPm25(
  root,
  records.map((r) => r.refTime)
)
const topology = JSON.parse(readFileSync(new URL('raw/earth-topo.json', root), 'utf8'))
const arcs = topology.arcs.map((arc) => {
  let x = 0,
    y = 0
  return arc.map((point) => {
    x += point[0]
    y += point[1]
    return [
      x * topology.transform.scale[0] + topology.transform.translate[0],
      y * topology.transform.scale[1] + topology.transform.translate[1]
    ]
  })
})
const lines = topology.objects.coastline_110m.geometries.map((line) =>
  line.arcs.flatMap((index, i) => {
    const points = index < 0 ? arcs[~index].slice().reverse() : arcs[index]
    return i ? points.slice(1) : points
  })
)
write('coastline.json', lines)
write('wind.json', records)
write('speed.json', {
  legend,
  frames: records.map((r) => ({
    time: r.refTime,
    width: r.width,
    height: r.height,
    bounds,
    values: r.u.map((u, i) => Math.round(Math.hypot(u, r.v[i]) * 100) / 100)
  }))
})
write('provenance.json', {
  provider: 'NOAA / NCEP GFS + Copernicus CAMS / ECMWF, distributed by earth.nullschool.net',
  downloadedAt: '2026-10-27T01:23:00Z',
  notice:
    'Offline forecast snapshots, not live observations. PM2.5 is a CAMS forecast in µg/m³, with GFS wind at matching valid times. Other modes in the sample dataset are synthetic.',
  particulate: pm25.provenance,
  coastline: {
    url: 'https://earth.nullschool.net/earth-topo.json',
    source: 'Natural Earth, coastline_110m',
    sha256: createHash('sha256')
      .update(readFileSync(new URL('raw/earth-topo.json', root)))
      .digest('hex')
  },
  records: provenance
})
write('manifest.json', {
  name: '真实风场与 PM2.5 · 离线快照',
  source: 'NOAA / NCEP GFS + CAMS / ECMWF · earth.nullschool.net',
  range: { start: records[0].refTime, end: records.at(-1).refTime },
  bounds,
  metadata: {
    kind: 'forecast-snapshot',
    resolution: 0.5,
    width: 721,
    height: 361,
    level: '地表上方 10 m',
    times: records.map((r) => r.refTime),
    provenance: '/data/earth/real/provenance.json',
    coastline: '/data/earth/real/coastline.json'
  },
  modes: [
    {
      id: 'atmosphere',
      label: '大气',
      defaultVector: 'wind',
      defaultOverlay: 'wind-speed',
      vectors: [
        {
          id: 'wind',
          label: '10 m 风',
          unit: 'm/s',
          data: '/data/earth/real/wind.json',
          colors: ['#d6f9ed'],
          speedFactor: 1.5
        }
      ],
      overlays: [
        {
          id: 'wind-speed',
          label: '风速',
          data: '/data/earth/real/speed.json',
          ...legend,
          metadata: {
            source: 'NOAA / NCEP GFS · earth.nullschool.net',
            resolution: 0.5,
            width: 721,
            height: 361,
            level: '地表上方 10 m',
            times: records.map((r) => r.refTime)
          }
        }
      ]
    },
    {
      id: 'particulate',
      label: '颗粒物 · PM2.5',
      defaultVector: 'wind',
      defaultOverlay: 'pm25',
      vectors: [
        {
          id: 'wind',
          label: '10 m 风 · GFS',
          unit: 'm/s',
          data: '/data/earth/real/wind.json',
          colors: ['#d6f9ed'],
          speedFactor: 1.5
        }
      ],
      overlays: [pm25.overlay]
    }
  ],
  annotations: [],
  weather: {
    sample: true,
    sampleTime: '2026-07-01T06:00:00.000Z',
    points: '/data/weather/cities.json',
    warnings: '/data/weather/warnings.geojson',
    windFarm: '/data/turbines.json'
  }
})
console.log(
  `Imported ${records.length} real GFS frames, 0.5°, ${records[0].width} × ${records[0].height}`
)
