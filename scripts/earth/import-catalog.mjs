import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { decodeEpak } from './decode-epak.mjs'

const root = new URL('../../apps/playground/public/data/earth/real/', import.meta.url)
const read = (name) => JSON.parse(readFileSync(new URL(name, root), 'utf8').replace(/^\uFEFF/, ''))
const write = (name, value) => writeFileSync(new URL(name, root), JSON.stringify(value) + '\n')
function writeBinary(name, values) {
  const bytes = Buffer.allocUnsafe(values.length * 4)
  for (let i = 0; i < values.length; i++) bytes.writeFloatLE(values[i] ?? NaN, i * 4)
  writeFileSync(new URL(name, root), bytes)
  writeFileSync(new URL(`${name}.gz`, root), gzipSync(bytes))
}
function writeScalar(key, legend, frames) {
  write(`${key}.json`, { legend, frames })
  const descriptors = frames.map((frame, i) => {
    const binary = `${key}-${i}.f32`
    writeBinary(binary, frame.values)
    return { ...frame, values: undefined, binary: `${binary}.gz` }
  })
  write(`${key}.meta.json`, { format: 'earth-scalar-f32-v1', legend, frames: descriptors })
}
const missing = -9999
const gfs = 'GFS / NCEP / NOAA'
const geos = 'GEOS-5 / GMAO / NASA'
const cams = 'CAMS / Copernicus / ECMWF'
const thermal = [
  '#25042a',
  '#290a82',
  '#c02595',
  '#46d7d7',
  '#1554bb',
  '#18840e',
  '#f7fb3b',
  '#eba715',
  '#e64727',
  '#581b43'
]
const pmColors = read('manifest.json')
  .modes.find((m) => m.id === 'particulate')
  .overlays.find((o) => o.id === 'pm25').colors
const sources = read('raw/catalog-sources.json')
sources.push({
  key: 'co2sc',
  file: 'raw/co2sc-current.epak',
  url: 'https://gaia.nullschool.net/data/geos/current/current-co2sc-geos.epak'
})
const records = []
const products = new Map()

function ramp(stops, count = 257) {
  const first = stops[0][0],
    last = stops.at(-1)[0]
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return Array.from({ length: count }, (_, i) => {
    const value = first + ((last - first) * i) / (count - 1)
    const index = Math.max(0, stops.findIndex(([stop]) => stop >= value) - 1)
    const [a, b] = value >= last ? stops.slice(-2) : stops.slice(index, index + 2)
    const t = (value - a[0]) / (b[0] - a[0]),
      from = rgb(a[1]),
      to = rgb(b[1])
    return (
      '#' +
      from
        .map((v, c) =>
          Math.round(v + (to[c] - v) * t)
            .toString(16)
            .padStart(2, '0')
        )
        .join('')
    )
  })
}

// Reorient native regular grids without inventing resolution. Longitudes that
// start between canonical nodes are interpolated; categories use nearest cells.
export function canonicalGrid(values, lon, lat, categorical = false) {
  if (lon.delta <= 0 || Math.abs(lon.delta * lon.size - 360) > 0.01 || !lat.delta)
    throw new Error('Expected a regular global longitude grid')
  if (values.length !== lon.size * lat.size) throw new Error('Grid length mismatch')
  const width = lon.size + 1,
    height = lat.size
  const mod = (x, n) => ((x % n) + n) % n
  const result = new Array(width * height)
  const valid = (v) => Number.isFinite(v) && Math.abs(v) < 1e15
  for (let y = 0; y < height; y++) {
    const row = (lat.delta < 0 ? height - 1 - y : y) * lon.size
    for (let x = 0; x < width; x++) {
      const source = mod((-180 + x * lon.delta - lon.start) / lon.delta, lon.size)
      const x0 = Math.floor(source),
        fraction = source - x0
      const a = values[row + x0],
        b = values[row + ((x0 + 1) % lon.size)]
      const v = categorical
        ? values[row + (Math.round(source) % lon.size)]
        : fraction < 1e-7
          ? a
          : fraction > 1 - 1e-7
            ? b
            : valid(a) && valid(b)
              ? a + (b - a) * fraction
              : NaN
      result[y * width + x] = valid(v) ? Math.round(v * 10000) / 10000 : missing
    }
  }
  const end = lat.start + lat.delta * (height - 1)
  return {
    width,
    height,
    bounds: {
      west: -180,
      east: 180,
      south: Math.min(lat.start, end),
      north: Math.max(lat.start, end)
    },
    values: result,
    noData: missing
  }
}

function decode(source) {
  const raw = readFileSync(new URL(source.file, root))
  const { header, blocks } = decodeEpak(raw)
  const vars = header.variables
  const lon = (vars.lon ?? vars.longitude).sequence
  const lat = (vars.lat ?? vars.latitude).sequence
  const fields = Object.entries(vars).filter(([, v]) => Number.isInteger(v.data?.block))
  const variable = fields[0][1]
  const time = new Date(vars[variable.dimensions[0]].data[0]).toISOString()
  const provenance = {
    ...source,
    sha256: createHash('sha256').update(raw).digest('hex'),
    validTime: time,
    sourceGrid: { longitude: lon, latitude: lat },
    sourceUnits: variable.units,
    modelRun: vars[variable.dimensions[0]]['init-time'],
    downloadedAt: '2026-10-27',
    history: header.history ?? header.History,
    institution: header.institution ?? header.Institution,
    transform:
      'Native resolution; south-first; periodic -180…180; bilinear longitude alignment (nearest for categories); missing=-9999'
  }
  records.push(provenance)
  return { header, blocks, fields, lon, lat, time, provenance }
}

function scalar(key, label, unit, min, max, colors, provider, options = {}) {
  const source = sources.find((s) => s.key === key)
  if (!source) throw new Error(`Missing source ${key}`)
  const data = decode(source)
  const variable = options.field ? data.header.variables[options.field] : data.fields[0][1]
  if (options.expectedUnits && variable.units !== options.expectedUnits)
    throw new Error(`Unexpected ${key} units`)
  const block = data.blocks[variable.data.block]
  const values = Float64Array.from(block.values, (v) =>
    Math.abs(v) < 1e15 ? v * (options.multiply ?? 1) + (options.offset ?? 0) : NaN
  )
  const grid = canonicalGrid(values, data.lon, data.lat, options.categorical)
  const legend = { min, max, unit, colors }
  writeScalar(key, legend, [{ time: data.time, ...grid }])
  const overlay = {
    id: key,
    label,
    data: `/data/earth/real/${key}.meta.json`,
    ...legend,
    scale: options.scale ?? 'linear',
    categories: options.categories,
    metadata: {
      source: provider,
      resolution: Math.abs(data.lat.delta),
      longitudeResolution: data.lon.delta,
      width: grid.width,
      height: grid.height,
      level: options.level ?? '近地面',
      times: [data.time]
    }
  }
  Object.assign(data.provenance, {
    outputUnits: unit,
    multiply: options.multiply ?? 1,
    offset: options.offset ?? 0
  })
  products.set(key, overlay)
  return overlay
}

function vector(key, label, unit, provider, options = {}) {
  const data = decode(sources.find((s) => s.key === key))
  let u = data.blocks[0].values,
    v = data.blocks[1].values
  if (options.wave) {
    const direction = u,
      period = v
    u = Float64Array.from(period, (p, i) => -p * Math.sin((direction[i] * Math.PI) / 180))
    v = Float64Array.from(period, (p, i) => -p * Math.cos((direction[i] * Math.PI) / 180))
  }
  const grid = canonicalGrid(u, data.lon, data.lat)
  const north = canonicalGrid(v, data.lon, data.lat)
  // JSON null represents missing ocean vectors; parser converts them to NaN.
  const clean = (values) => values.map((v) => (v === missing ? null : v))
  write(`${key}-vector.json`, [
    {
      refTime: data.time,
      width: grid.width,
      height: grid.height,
      bounds: grid.bounds,
      u: clean(grid.values),
      v: clean(north.values)
    }
  ])
  writeBinary(`${key}-vector.f32`, [
    ...grid.values.map((v) => (v === missing ? NaN : v)),
    ...north.values.map((v) => (v === missing ? NaN : v))
  ])
  write(`${key}-vector.meta.json`, {
    format: 'wind-f32-v1',
    binary: `${key}-vector.f32.gz`,
    width: grid.width,
    height: grid.height,
    bounds: grid.bounds,
    refTime: data.time
  })
  const result = {
    id: key,
    label,
    unit,
    data: `/data/earth/real/${key}-vector.meta.json`,
    speedFactor: options.wave ? 1 : key === 'currents' ? 30 : 1.5,
    kind: options.wave ? 'waves' : key === 'currents' ? 'currents' : 'wind',
    metadata: {
      source: provider,
      times: [data.time],
      level: options.wave
        ? '海面波向与周期'
        : key === 'currents'
          ? '海面下 5 m'
          : key.replace('wind-', '')
    }
  }
  const speed = grid.values.map((value, i) =>
    value === missing || north.values[i] === missing
      ? missing
      : Math.round(Math.hypot(value, north.values[i]) * 1000) / 1000
  )
  const legend = {
    min: 0,
    max: options.wave ? 25 : key === 'currents' ? 1.5 : 70,
    unit,
    colors: options.wave
      ? ['#132456', '#477d91', '#40d4d5', '#f2efa3', '#f89740']
      : ['#0a1944', '#0a19fa', '#18ff5d', '#ffe966', '#ff0f0f']
  }
  const id = options.wave ? 'wave-period' : key === 'currents' ? 'current-speed' : `${key}-speed`
  writeScalar(id, legend, [{ ...grid, values: speed, time: data.time }])
  products.set(id, {
    id,
    label: options.wave ? '波峰周期' : key === 'currents' ? '洋流速度' : '风速',
    data: `/data/earth/real/${id}.meta.json`,
    ...legend,
    metadata: {
      source: provider,
      resolution: Math.abs(data.lat.delta),
      longitudeResolution: data.lon.delta,
      width: grid.width,
      height: grid.height,
      times: [data.time],
      level: result.metadata.level
    }
  })
  return result
}

export function importCatalog() {
  records.length = 0
  scalar(
    'co2sc',
    'CO₂ · 地表二氧化碳',
    'ppmv',
    380,
    510,
    ramp([
      [380, '#000000'],
      [412, '#640000'],
      [418, '#a42400'],
      [438, '#ffdc8c'],
      [485, '#00dcb4'],
      [510, '#00ffff']
    ]),
    geos,
    { expectedUnits: '1e-6' }
  )
  scalar(
    'cosc',
    'CO · 地表一氧化碳',
    'ppbv',
    40,
    2500,
    ['#002628', '#ffffe0', '#00009a', '#000000'],
    geos
  )
  scalar(
    'so2smass',
    'SO₂ · 地表二氧化硫',
    'µg/m³',
    0.0001,
    888,
    ['#86866b', '#909075', '#ffffe0', '#000080', '#171412'],
    geos,
    { multiply: 1e9, scale: 'log', expectedUnits: 'kg m-3' }
  )
  scalar(
    'no2',
    'NO₂ · 二氧化氮',
    'ppbw',
    0.01,
    200,
    ['#ffffcc', '#fd8d3c', '#e31a1c', '#800026'],
    cams,
    { multiply: 1e9, scale: 'log', expectedUnits: 'kg kg**-1' }
  )
  for (const id of ['pm1', 'pm10'])
    scalar(id, id === 'pm1' ? 'PM1' : 'PM10', 'µg/m³', 1, 1000, pmColors, cams, {
      multiply: 1e9,
      scale: 'log',
      expectedUnits: 'kg m**-3'
    })
  scalar(
    'dust',
    '尘埃消光',
    'AOT',
    0.0001,
    3,
    ['#040404', '#291540', '#194a85', '#007e76', '#8fc577', '#ffffff'],
    geos,
    { scale: 'log', level: '550 nm 气溶胶光学厚度' }
  )
  scalar(
    'sulfate',
    '硫酸盐消光',
    'AOT',
    0.002,
    2.5,
    ['#08324d', '#58b9ce', '#dfedd5', '#c073a0', '#731236'],
    geos,
    { scale: 'log', level: '550 nm 气溶胶光学厚度' }
  )
  scalar(
    'organic',
    '有机物气溶胶',
    'AOT',
    0.01,
    3.5,
    ['#174f7c', '#629bcc', '#ffffff', '#efa97e', '#8a6a01', '#3d002d'],
    cams,
    { level: '550 nm 气溶胶光学厚度' }
  )
  scalar('temperature', '温度', '°C', -80, 55, thermal, gfs, {
    offset: -273.15,
    expectedUnits: 'K',
    level: '地表上方 2 m'
  })
  scalar(
    'humidity',
    '相对湿度',
    '%',
    0,
    100,
    ['#e6a51e', '#78645f', '#282c5c', '#150dc1', '#4b3feb', '#19ffff'],
    gfs
  )
  scalar('dewpoint', '露点温度', '°C', -80, 55, thermal, gfs, { offset: -273.15 })
  scalar(
    'wetbulb',
    '湿球温度',
    '°C',
    -50,
    33.5,
    ['#e4ecff', '#a5b7e6', '#334682', '#503169', '#a1315e', '#de3254', '#fcff36'],
    gfs,
    { offset: -273.15 }
  )
  scalar(
    'rain',
    '3 小时累积降水',
    'mm',
    0,
    50,
    ['#101333', '#1c56b7', '#37cc73', '#e6e554', '#ed832c', '#ad1552'],
    gfs
  )
  scalar(
    'cape',
    '对流可用位能',
    'J/kg',
    0,
    5000,
    ['#111c40', '#227b9a', '#43c076', '#f0e340', '#d44337', '#f100e9'],
    gfs
  )
  scalar(
    'water',
    '水汽含量',
    'kg/m²',
    0,
    70,
    ['#e6a51e', '#78645f', '#282c5c', '#150dc1', '#4b3feb', '#19ffff'],
    gfs,
    { level: '整层大气' }
  )
  scalar('cloud', '云水总量', 'kg/m²', 0, 1, ['#050559', '#aaaae6', '#ffffff'], gfs, {
    level: '整层大气'
  })
  scalar(
    'pressure',
    '平均海平面气压',
    'hPa',
    920,
    1060,
    ['#180d4d', '#2a53bc', '#2ebfa5', '#dbdf65', '#d65d3e', '#6f154b'],
    gfs,
    { multiply: 0.01, expectedUnits: 'Pa', level: '海平面' }
  )
  scalar('feels-like', '体感温度', '°C', -50, 60, thermal, gfs, { offset: -273.15 })
  scalar(
    'uvi',
    '紫外线指数',
    'UV',
    0,
    18,
    ['#181922', '#3ea72d', '#ffee00', '#f18b00', '#e53210', '#b567a4', '#e7e1ff'],
    'CPC / NCEP / NOAA',
    { multiply: 40 }
  )
  scalar('sst', '海面温度', '°C', -3.15, 40, thermal, 'OSTIA / UK Met Office / CMEMS', {
    offset: -273.15,
    level: '海表'
  })
  scalar(
    'sst-anomaly-oisst',
    '海温异常',
    '°C',
    -11,
    11,
    ['#ffffff', '#07fcfe', '#422afd', '#000006', '#fd0e10', '#fefc00', '#ffffff'],
    'OI SST / PSL / NOAA',
    { level: '相对气候平均海温的偏差' }
  )
  scalar(
    'wave-height',
    '有效浪高',
    'm',
    0,
    15,
    ['#102459', '#2e7c9b', '#2dc7b5', '#e8df4e', '#e06b35', '#dd10ae'],
    'WAVEWATCH III / NOAA',
    { level: '海面' }
  )
  const categories = [
    '无热压力',
    '白化关注',
    '白化警告',
    '警报 1 级',
    '警报 2 级',
    '警报 3 级',
    '警报 4 级',
    '警报 5 级'
  ]
  scalar(
    'coral',
    '珊瑚白化警报区域',
    '热压力等级',
    0,
    7,
    ['#057ab0', '#ffffb2', '#fecc5c', '#fd8d3c', '#e31a1c', '#bd0026', '#800026', '#46002a'],
    'Coral Reef Watch / NOAA',
    { categorical: true, categories, level: '7 日最大白化警报' }
  )
  const currents = vector('currents', '洋流 · 海面下 5 m', 'm/s', 'CMEMS / Global Ocean Physics')
  const waves = vector('waves', '波浪 · 波向与周期', 's', 'WAVEWATCH III / NOAA', { wave: true })
  const levels = []
  for (const level of ['1000hPa', '850hPa', '700hPa', '500hPa', '250hPa', '70hPa', '10hPa']) {
    const wind = vector(`wind-${level}`, `${level} 风`, 'm/s', gfs)
    const temp = scalar(`temp-${level}`, '温度', '°C', -80, 55, thermal, gfs, {
      offset: -273.15,
      level
    })
    const rh = scalar(
      `relative_humidity-${level}`,
      '相对湿度',
      '%',
      0,
      100,
      ['#e6a51e', '#282c5c', '#150dc1', '#19ffff'],
      gfs,
      { level }
    )
    const density = decode(sources.find((s) => s.key === `air_density-${level}`))
    const rho = canonicalGrid(density.blocks[0].values, density.lon, density.lat)
    const speeds = read(`wind-${level}-speed.json`).frames[0]
    if (density.time !== speeds.time || rho.width !== speeds.width || rho.height !== speeds.height)
      throw new Error('Density and wind must have matching grids/times')
    const power = speeds.values.map((speed, i) =>
      speed === missing || rho.values[i] === missing
        ? missing
        : Math.round(0.5 * rho.values[i] * speed ** 3 * 100) / 100
    )
    const powerLegend = {
      min: 0,
      max: 80000,
      unit: 'W/m²',
      colors: ['#0f0460', '#796602', '#76a142', '#3266db', '#3bcce3', '#f1012d', '#f300f1']
    }
    const powerId = `wpd-${level}`
    writeScalar(powerId, powerLegend, [{ ...speeds, values: power }])
    products.set(powerId, {
      id: powerId,
      label: '风电功率密度',
      data: `/data/earth/real/${powerId}.meta.json`,
      ...powerLegend,
      metadata: { ...temp.metadata, source: gfs, times: [speeds.time] }
    })
    density.provenance.derived = '0.5 × air_density × hypot(u,v)^3; W/m²; same valid time and grid'
    levels.push({
      id: level,
      label: level.replace('hPa', ' hPa'),
      vectors: [wind],
      overlays: [products.get(`wind-${level}-speed`), temp, rh, products.get(powerId)],
      defaultVector: wind.id,
      defaultOverlay: `wind-${level}-speed`
    })
  }
  const aurora = read('raw/aurora-current.json')
  const rows = aurora.data.map((row) => {
    const values = [],
      factor = aurora.encoding.scale_factor ?? 1,
      offset = aurora.encoding.add_offset ?? 0
    let cumulative = 0
    for (const item of row) {
      const [delta, count] = Array.isArray(item) ? item : [item, 1]
      if (!Number.isInteger(count) || count < 1 || values.length + count > aurora.lon.size)
        throw new Error('Invalid aurora run')
      for (let i = 0; i < count; i++) {
        if (delta === null) {
          values.push(NaN)
          cumulative = 0
        } else {
          cumulative += delta
          values.push(cumulative * factor + offset)
        }
      }
    }
    if (values.length !== aurora.lon.size) throw new Error('Aurora row length mismatch')
    return values
  })
  if (rows.length !== aurora.lat.size) throw new Error('Aurora latitude mismatch')
  const auroraGrid = canonicalGrid(rows.flat(), aurora.lon, aurora.lat)
  const auroraLegend = {
    min: 0,
    max: 100,
    unit: '%',
    colors: ramp([
      [0, '#000000'],
      [5, '#040822'],
      [40, '#4eff67'],
      [60, '#fcff39'],
      [100, '#db4bff']
    ])
  }
  const auroraTime = new Date(aurora.date).toISOString()
  writeScalar('aurora', auroraLegend, [{ ...auroraGrid, time: auroraTime }])
  products.set('aurora', {
    id: 'aurora',
    label: '可见极光概率',
    ...auroraLegend,
    data: '/data/earth/real/aurora.meta.json',
    metadata: {
      source: aurora.institution,
      resolution: 1,
      longitudeResolution: 1,
      width: auroraGrid.width,
      height: auroraGrid.height,
      level: '可见概率',
      times: [auroraTime]
    }
  })
  records.push({
    ...sources.find((s) => s.key === 'aurora'),
    sha256: createHash('sha256')
      .update(readFileSync(new URL('raw/aurora-current.json', root)))
      .digest('hex'),
    validTime: auroraTime,
    sourceUnits: '%',
    sourceGrid: { longitude: aurora.lon, latitude: aurora.lat }
  })
  const manifest = read('manifest.json')
  const firesRaw = readFileSync(new URL('raw/fires-current.epak', root))
  const fires = decodeEpak(firesRaw)
  const columns = fires.header.columns
  const times = fires.blocks[columns.timestamp.block].values
  const lons = fires.blocks[columns.longitude.block].values
  const lats = fires.blocks[columns.latitude.block].values
  const frps = fires.blocks[columns.frp.block].values
  if (![lons, lats, frps].every((array) => array.length === times.length))
    throw new Error('FIRMS column lengths differ')
  const fireIndices = Array.from(times.keys())
    .filter(
      (i) =>
        Number.isFinite(times[i]) &&
        Math.abs(lons[i]) <= 180 &&
        Math.abs(lats[i]) <= 90 &&
        Number.isFinite(frps[i])
    )
    .sort((a, b) => frps[b] - frps[a])
    .slice(0, 2000)
  write('fires.geojson', {
    type: 'FeatureCollection',
    features: fireIndices.map((i) => ({
      type: 'Feature',
      properties: {
        id: `firms-${i}`,
        label: 'VIIRS 活跃火点',
        frp: frps[i],
        observedAt: new Date(times[i]).toISOString()
      },
      geometry: { type: 'Point', coordinates: [lons[i], lats[i]] }
    }))
  })
  records.push({
    file: 'raw/fires-current.epak',
    url: 'https://gaia.nullschool.net/data/firms/current/current-firms.epak',
    sha256: createHash('sha256').update(firesRaw).digest('hex'),
    institution: fires.header.institution,
    count: times.length,
    displayedCount: fireIndices.length,
    selection: 'Highest 2000 fire radiative power observations; no fabricated locations/times',
    startTime: new Date(Math.min(...times)).toISOString(),
    endTime: new Date(Math.max(...times)).toISOString()
  })
  const atmosphere = manifest.modes[0],
    particulate = manifest.modes.find((m) => m.id === 'particulate')
  const originalWind = read('wind.json')
  const windFrames = originalWind.map((frame, i) => {
    const binary = `wind-${i}.f32`
    writeBinary(binary, [...frame.u, ...frame.v])
    return { ...frame, u: undefined, v: undefined, binary: `${binary}.gz` }
  })
  write('wind.meta.json', { format: 'wind-f32-series-v1', frames: windFrames })
  const originalSpeed = read('speed.json'),
    originalPm25 = read('pm25.json')
  writeScalar('speed', originalSpeed.legend, originalSpeed.frames)
  writeScalar('pm25', originalPm25.legend, originalPm25.frames)
  atmosphere.overlays[0].data = '/data/earth/real/speed.meta.json'
  particulate.overlays[0].data = '/data/earth/real/pm25.meta.json'
  const wind = {
    ...atmosphere.vectors[0],
    data: '/data/earth/real/wind.meta.json',
    kind: 'wind',
    metadata: { source: gfs, times: manifest.metadata.times, level: '地表上方 10 m' }
  }
  const take = (...keys) =>
    keys.map((key) => {
      const p = products.get(key)
      if (!p) throw new Error(`Missing product ${key}`)
      return p
    })
  atmosphere.vectors = [wind]
  atmosphere.overlays.push(
    ...take(
      'temperature',
      'humidity',
      'dewpoint',
      'wetbulb',
      'rain',
      'cape',
      'water',
      'cloud',
      'pressure',
      'feels-like',
      'uvi'
    )
  )
  atmosphere.levels = [
    {
      id: 'surface',
      label: '近地面',
      vectors: atmosphere.vectors,
      overlays: atmosphere.overlays,
      defaultVector: 'wind',
      defaultOverlay: 'wind-speed'
    },
    ...levels
  ]
  atmosphere.defaultLevel = 'surface'
  particulate.label = '颗粒物'
  particulate.vectors = [wind]
  particulate.overlays = [
    products.get('dust'),
    products.get('pm1'),
    particulate.overlays[0],
    ...take('pm10', 'organic', 'sulfate')
  ]
  manifest.modes = [
    atmosphere,
    {
      id: 'ocean',
      label: '海洋',
      vectors: [currents, waves],
      overlays: take(
        'current-speed',
        'wave-period',
        'wave-height',
        'sst',
        'sst-anomaly-oisst',
        'coral'
      ),
      defaultVector: 'currents',
      defaultOverlay: 'current-speed'
    },
    {
      id: 'chemistry',
      label: '大气化学',
      vectors: [wind],
      overlays: take('cosc', 'co2sc', 'so2smass', 'no2'),
      defaultVector: 'wind',
      defaultOverlay: 'co2sc'
    },
    particulate,
    {
      id: 'space',
      label: '空间天气',
      vectors: [],
      overlays: take('aurora'),
      defaultOverlay: 'aurora'
    },
    { id: 'biology', label: '生物', vectors: [], overlays: take('coral'), defaultOverlay: 'coral' }
  ]
  manifest.name = '全球多模式真实数据 · 离线快照'
  manifest.annotations = [
    {
      id: 'fires',
      label: '活跃火点 · 强度前 2000 个',
      type: 'points',
      data: '/data/earth/real/fires.geojson'
    }
  ]
  manifest.source = 'GFS · GEOS-5 · CAMS · CMEMS · NOAA · earth.nullschool.net'
  write('manifest.json', manifest)
  const provenance = read('provenance.json')
  provenance.catalog = records
  provenance.notice =
    'Offline snapshots; product valid times differ. Each overlay displays its actual time; vector and scalar times are independent. See catalog for original units, transformations, grids and checksums.'
  write('provenance.json', provenance)
  console.log(
    `Imported ${products.size} scalar products, ${levels.length + 1} atmospheric levels and 6 modes`
  )
}
