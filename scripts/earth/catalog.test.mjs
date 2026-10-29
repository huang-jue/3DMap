import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { decodeEpak } from './decode-epak.mjs'
import { canonicalGrid } from './import-catalog.mjs'

const root = new URL('../../apps/playground/public/data/earth/real/', import.meta.url)
const json = (name) => JSON.parse(readFileSync(new URL(name, root), 'utf8'))

test('catalog exposes all six modes, native atmosphere levels and real product metadata', () => {
  const manifest = json('manifest.json')
  assert.deepEqual(
    manifest.modes.map((m) => m.id),
    ['atmosphere', 'ocean', 'chemistry', 'particulate', 'space', 'biology']
  )
  assert.deepEqual(
    manifest.modes[2].overlays.map((o) => o.id),
    ['cosc', 'co2sc', 'so2smass', 'no2']
  )
  assert.equal(manifest.modes[3].overlays.length, 6)
  const particulate = manifest.modes[3].overlays
  assert.deepEqual(
    particulate.find((o) => o.id === 'pm1').colors,
    particulate.find((o) => o.id === 'pm25').colors
  )
  assert.deepEqual(
    particulate.find((o) => o.id === 'pm10').colors,
    particulate.find((o) => o.id === 'pm25').colors
  )
  assert.equal(manifest.modes[0].levels.length, 8)
  assert.equal(manifest.modes[4].vectors.length, 0)
  assert.equal(manifest.modes[5].overlays[0].categories.length, 8)
  const entries = manifest.modes.flatMap((m) => [
    ...m.overlays,
    ...(m.levels?.flatMap((l) => l.overlays) ?? [])
  ])
  for (const overlay of entries) {
    assert.ok(overlay.metadata.source && overlay.metadata.times.length > 0)
    const scalar = json(
      overlay.data.replace('/data/earth/real/', '').replace('.meta.json', '.json')
    )
    if (overlay.data.endsWith('.meta.json')) {
      const binaryMeta = json(overlay.data.replace('/data/earth/real/', ''))
      const raw = gunzipSync(readFileSync(new URL(binaryMeta.frames[0].binary, root)))
      assert.equal(raw.length, scalar.frames[0].width * scalar.frames[0].height * 4)
      for (const index of [0, 12345, scalar.frames[0].values.length - 1]) {
        assert.ok(Math.abs(raw.readFloatLE(index * 4) - scalar.frames[0].values[index]) < 0.005)
      }
    }
    assert.deepEqual(
      overlay.metadata.times,
      scalar.frames.map((f) => f.time)
    )
    for (const frame of scalar.frames) {
      assert.equal(frame.values.length, frame.width * frame.height)
      assert.ok(frame.values.every(Number.isFinite))
      for (const y of [0, Math.floor(frame.height / 2), frame.height - 1])
        assert.ok(
          Math.abs(
            frame.values[y * frame.width] - frame.values[y * frame.width + frame.width - 1]
          ) < 0.002
        )
    }
  }
})

test('CO2 retains original south-first GEOS values and 1e-6 is ppmv without multiplying', () => {
  const source = json('provenance.json').catalog.find((p) => p.key === 'co2sc')
  const raw = readFileSync(new URL(source.file, root))
  const decoded = decodeEpak(raw)
  assert.equal(createHash('sha256').update(raw).digest('hex'), source.sha256)
  const frame = json('co2sc.json').frames[0]
  assert.equal(frame.time, new Date(decoded.header.variables.time.data[0]).toISOString())
  assert.equal(frame.width, 1153)
  assert.equal(frame.height, 721)
  for (const y of [0, 110, 360, 500, 720]) {
    for (const x of [0, 100, 576, 1152]) {
      assert.ok(
        Math.abs(frame.values[y * 1153 + x] - decoded.blocks[0].values[y * 1152 + (x % 1152)]) <
          0.00011
      )
    }
  }
  const populated = frame.values.filter((v) => v !== frame.noData)
  assert.ok(populated.every((v) => v > 300 && v < 1000))
})

test('CAMS unit conversions and categorical bleaching preserve physical values and land mask', () => {
  const no2Raw = decodeEpak(readFileSync(new URL('raw/no2-current.epak', root)))
  const no2 = json('no2.json').frames[0]
  const original = no2Raw.blocks[0].values[(450 - 225) * 900 + 450] * 1e9
  assert.ok(Math.abs(no2.values[225 * 901] - original) < 0.00011)
  const coral = json('coral.json').frames[0]
  assert.ok(coral.values.some((v) => v === coral.noData))
  assert.ok(
    coral.values
      .filter((v) => v !== coral.noData)
      .every((v) => Number.isInteger(v) && v >= 0 && v <= 7)
  )
  const currents = json('currents-vector.json')[0]
  assert.ok(currents.u.some((v) => v === null))
  assert.ok(currents.u.some((v) => v !== null && Math.abs(v) > 0.1))
  assert.ok(Date.parse(json('sst-anomaly-oisst.json').frames[0].time) > Date.parse('2026-10-01'))
})

test('power density uses wind and air density at the same valid time; no fake forecast frames', () => {
  for (const level of ['1000hPa', '850hPa', '700hPa', '500hPa', '250hPa', '70hPa', '10hPa']) {
    const power = json(`wpd-${level}.json`).frames[0]
    const speed = json(`wind-${level}-speed.json`).frames[0]
    const decoded = decodeEpak(readFileSync(new URL(`raw/air_density-${level}-current.epak`, root)))
    assert.equal(power.time, speed.time)
    assert.equal(power.time, new Date(decoded.header.variables.time.data[0]).toISOString())
    const variables = decoded.header.variables
    const density = canonicalGrid(
      decoded.blocks[0].values,
      variables.lon.sequence,
      variables.lat.sequence
    )
    for (const i of [12345, 100000, 150000]) {
      assert.ok(Math.abs(power.values[i] - 0.5 * density.values[i] * speed.values[i] ** 3) < 0.011)
    }
  }
})

test('qpak timestamps keep double precision and FIRMS points retain actual observed coordinates', () => {
  const raw = readFileSync(new URL('raw/fires-current.epak', root))
  const decoded = decodeEpak(raw)
  assert.ok(decoded.blocks[0].values instanceof Float64Array)
  const timestamps = decoded.blocks[0].values
  assert.ok(timestamps.every((t) => Number.isSafeInteger(t) && t > Date.parse('2026-10-01')))
  const points = json('fires.geojson').features
  assert.equal(points.length, 2000)
  for (const point of points.slice(0, 10)) {
    const index = Number(point.properties.id.split('-')[1])
    assert.equal(point.properties.observedAt, new Date(timestamps[index]).toISOString())
    assert.deepEqual(point.geometry.coordinates, [
      decoded.blocks[1].values[index],
      decoded.blocks[2].values[index]
    ])
  }
  assert.throws(() => decodeEpak(raw.subarray(0, raw.length - 30)))
})

test('canonical remapping reverses north-first rows, wraps longitude and does not blend categories', () => {
  const lon = { start: 0, delta: 90, size: 4 },
    lat = { start: 45, delta: -90, size: 2 }
  assert.deepEqual(
    canonicalGrid([1, 2, 3, 4, 5, 6, 7, 8], lon, lat).values,
    [7, 8, 5, 6, 7, 3, 4, 1, 2, 3]
  )
  const shifted = { ...lon, start: 45 }
  assert.equal(canonicalGrid([0, 1, 2, 3, 4, 5, 6, 7], shifted, lat, true).values[0], 6)
})
