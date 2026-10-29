import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { decodeEpak } from './decode-epak.mjs'

const root = new URL('../../apps/playground/public/data/earth/real/', import.meta.url)
const json = (name) => JSON.parse(readFileSync(new URL(name, root), 'utf8'))

test('real GFS snapshot preserves component orientation, values, seam, times and provenance', () => {
  const records = json('wind.json')
  const speed = json('speed.json').frames
  const provenance = json('provenance.json').records
  assert.equal(records.length, 3)
  for (const [index, source] of provenance.entries()) {
    const raw = readFileSync(new URL(source.file, root))
    assert.equal(createHash('sha256').update(raw).digest('hex'), source.sha256)
    const decoded = decodeEpak(raw)
    const record = records.find(
      (r) => r.refTime === new Date(decoded.header.variables.time.data[0]).toISOString()
    )
    assert.ok(record)
    assert.equal(record.width, 721)
    assert.equal(record.height, 361)
    assert.equal(record.u.length, record.width * record.height)
    for (const y of [0, 60, 180, 300, 360]) {
      assert.equal(record.u[y * 721], record.u[y * 721 + 720])
      for (const x of [0, 90, 360, 540, 720]) {
        const target = y * 721 + x
        const original = (360 - y) * 720 + ((x + 360) % 720)
        assert.ok(Math.abs(record.u[target] - decoded.blocks[0].values[original]) < 0.011)
        assert.ok(Math.abs(record.v[target] - decoded.blocks[1].values[original]) < 0.011)
      }
    }
    const frame = speed.find((frame) => frame.time === record.refTime)
    assert.ok(frame)
    assert.ok(
      Math.abs(frame.values[12345] - Math.hypot(record.u[12345], record.v[12345])) <= 0.0051
    )
    assert.ok(index === 0 || source.validTime !== provenance[index - 1].validTime)
  }
})

test('decoder rejects a truncated or unknown container', () => {
  assert.throws(() => decodeEpak(Buffer.from('invalid file')))
  const raw = readFileSync(new URL(provenanceFile(), root))
  assert.throws(() => decodeEpak(raw.subarray(0, raw.length - 50)))
})
function provenanceFile() {
  return json('provenance.json').records[0].file
}

test('CAMS PM2.5 preserves concentration units, orientation, seam and GFS-aligned times', () => {
  const { frames, legend } = json('pm25.json')
  const sources = json('provenance.json').particulate
  assert.equal(legend.unit, 'µg/m³')
  assert.deepEqual(
    frames.map((f) => f.time),
    json('wind.json').map((f) => f.refTime)
  )
  assert.equal(sources.length, 3)
  for (const source of sources) {
    const raw = readFileSync(new URL(source.file, root))
    assert.equal(createHash('sha256').update(raw).digest('hex'), source.sha256)
    const decoded = decodeEpak(raw)
    const frame = frames.find((f) => f.time === source.validTime)
    assert.equal(frame.width, 901)
    assert.equal(frame.height, 451)
    assert.equal(frame.values.length, 901 * 451)
    assert.ok(frame.values.every((v) => Number.isFinite(v) && v >= 0))
    for (const y of [0, 75, 225, 375, 450]) {
      assert.equal(frame.values[y * 901], frame.values[y * 901 + 900])
      for (const x of [0, 100, 450, 675, 900]) {
        const original = (450 - y) * 900 + ((x + 450) % 900)
        assert.ok(
          Math.abs(frame.values[y * 901 + x] - decoded.blocks[0].values[original] * 1e9) <= 0.00051
        )
      }
    }
    // Delhi and the remote Pacific cannot have a synthetic, uniform field.
    const at = (lon, lat) =>
      frame.values[Math.round((lat + 90) / 0.4) * 901 + Math.round((lon + 180) / 0.4)]
    assert.ok(at(77.2, 28.6) > at(-150, 0))
  }
  const particulate = json('manifest.json').modes.find((mode) => mode.id === 'particulate')
  assert.equal(particulate.defaultOverlay, 'pm25')
  const pm25 = particulate.overlays.find((overlay) => overlay.id === 'pm25')
  assert.equal(pm25.scale, 'log')
  assert.equal(pm25.metadata.resolution, 0.4)
})
