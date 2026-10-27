import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { decodeEpak } from './decode-epak.mjs'

// Concentration anchors in µg/m³. Sample evenly in log space so the renderer,
// legend and point-query colors all use the same concentration mapping.
const anchors = [
  [1, '#081d58'],
  [4, '#253494'],
  [6, '#225ea8'],
  [8, '#1d91c0'],
  [10, '#41b6c4'],
  [16, '#7fcdbb'],
  [24, '#c7e9b4'],
  [28, '#edf8b1'],
  [32, '#ffffd2'],
  [42, '#ffeda0'],
  [47, '#fed976'],
  [57, '#feb24c'],
  [67, '#fd8d3c'],
  [110, '#fc4e2a'],
  [250, '#e31a1c'],
  [500, '#bd0026'],
  [1000, '#800026']
]
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const colors = Array.from({ length: 257 }, (_, i) => {
  const value = 1000 ** (i / 256)
  const index = Math.max(0, anchors.findIndex(([stop]) => stop >= value) - 1)
  const [low, high] = value >= 1000 ? anchors.slice(-2) : anchors.slice(index, index + 2)
  const t = (Math.log(value) - Math.log(low[0])) / Math.log(high[0] / low[0])
  const a = rgb(low[1]),
    b = rgb(high[1])
  return (
    '#' +
    a
      .map((v, c) =>
        Math.round(v + (b[c] - v) * t)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  )
})

export function importPm25(root, expectedTimes) {
  const bounds = { west: -180, south: -90, east: 180, north: 90 }
  const legend = { min: 1, max: 1000, unit: 'µg/m³', colors }
  const sources = [
    ['pm25-0100.epak', '2026/10/27/0100-pm2p5-cams.epak'],
    ['pm25-current.epak', 'current/current-pm2p5-cams.epak'],
    ['pm25-0600.epak', '2026/10/27/0600-pm2p5-cams.epak']
  ]
  const provenance = []
  const frames = sources
    .map(([file, path]) => {
      const raw = readFileSync(new URL(`raw/${file}`, root))
      const { header, blocks } = decodeEpak(raw)
      const { latitude, longitude, pm2p5, time } = header.variables
      if (
        latitude.sequence.start !== 90 ||
        latitude.sequence.delta !== -0.4 ||
        latitude.sequence.size !== 451 ||
        longitude.sequence.start !== 0 ||
        longitude.sequence.delta !== 0.4 ||
        longitude.sequence.size !== 900 ||
        pm2p5.units !== 'kg m**-3'
      )
        throw new Error('Unexpected CAMS grid/units')
      const block = blocks[pm2p5.data.block]
      if (!block || block.cols !== 900 || block.rows !== 451 || block.grids !== 1)
        throw new Error('Invalid CAMS PM2.5 block')
      const values = []
      for (let y = 0; y < 451; y++) {
        for (let x = 0; x <= 900; x++) {
          const value = block.values[(450 - y) * 900 + ((x + 450) % 900)] * 1e9
          if (!Number.isFinite(value) || value < 0) throw new Error('Invalid PM2.5 concentration')
          values.push(Math.round(value * 1000) / 1000)
        }
      }
      const validTime = new Date(time.data[0]).toISOString()
      provenance.push({
        file: `raw/${file}`,
        url: `https://gaia.nullschool.net/data/cams/${path}`,
        sha256: createHash('sha256').update(raw).digest('hex'),
        validTime,
        modelRun: time['init-time'],
        provider: 'Copernicus Atmosphere Monitoring Service / ECMWF',
        sourceUnits: pm2p5.units,
        outputUnits: legend.unit,
        unitMultiplier: 1e9,
        sourceGrid: { width: 900, height: 451, resolution: 0.4 },
        history: header.history
      })
      return { time: validTime, width: 901, height: 451, bounds, values }
    })
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
  const times = frames.map((f) => f.time)
  if (JSON.stringify(times) !== JSON.stringify(expectedTimes))
    throw new Error('CAMS and GFS snapshot times must match')
  writeFileSync(new URL('pm25.json', root), JSON.stringify({ legend, frames }) + '\n')
  return {
    provenance,
    overlay: {
      id: 'pm25',
      label: 'PM2.5',
      data: '/data/earth/real/pm25.json',
      scale: 'log',
      ...legend,
      metadata: {
        source: 'CAMS / ECMWF · earth.nullschool.net',
        resolution: 0.4,
        width: 901,
        height: 451,
        level: '地表颗粒物浓度',
        times
      }
    }
  }
}
