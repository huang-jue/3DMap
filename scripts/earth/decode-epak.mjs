// Bounded EPak ppak grids / qpak column decoder. No remote code is executed.
export function decodeEpak(buffer) {
  let offset = 0
  const need = (size) => {
    if (size < 0 || offset + size > buffer.length) throw new Error('Truncated EPak')
  }
  const tag = () => {
    need(4)
    const value = buffer.toString('ascii', offset, offset + 4)
    offset += 4
    return value
  }
  const size = () => {
    need(4)
    const value = buffer.readUInt32BE(offset)
    offset += 4
    return value
  }
  if (tag() !== 'head') throw new Error('Invalid EPak header')
  const length = size()
  need(length)
  const header = JSON.parse(buffer.toString('utf8', offset, offset + length))
  offset += length
  const blocks = []
  while (true) {
    const type = tag()
    if (type === 'tail') break
    if (type !== 'ppak' && type !== 'qpak') throw new Error(`Unsupported EPak block ${type}`)
    const length = size()
    need(length)
    const column = type === 'qpak'
    const headerSize = column ? 13 : 16
    if (length < headerSize) throw new Error('Invalid packed header')
    const block = buffer.subarray(offset, offset + length)
    offset += length
    const element = column ? block.readUInt8(0) : 8
    if (element !== 8 && element !== 9) throw new Error('Unsupported qpak element')
    const cols = column ? block.readUInt32BE(1) : block.readUInt32BE(0)
    const rows = column ? 1 : block.readUInt32BE(4)
    const grids = column ? 1 : block.readUInt32BE(8)
    const scale = column ? block.readDoubleBE(5) : 10 ** block.readFloatBE(12)
    const count = cols * rows * grids
    if (!cols || !rows || !grids || count > 20_000_000 || !Number.isFinite(scale) || scale <= 0)
      throw new Error('Invalid ppak dimensions')
    const values = element === 9 ? new Float64Array(count) : new Float32Array(count)
    let cursor = headerSize
    let index = 0
    const byte = () => {
      if (cursor >= block.length) throw new Error('Truncated ppak integer')
      return block[cursor++]
    }
    while (cursor < block.length) {
      const first = byte()
      if (first === 255) {
        const end = index + byte() + 1
        if (end > count) throw new Error('ppak missing run overflow')
        values.fill(NaN, index, end)
        index = end
        continue
      }
      let bits, value, remaining
      if (first < 128) {
        bits = 7
        value = first
        remaining = 0
      } else if (first < 192) {
        bits = 14
        value = first & 63
        remaining = 1
      } else if (first < 224) {
        bits = 21
        value = first & 31
        remaining = 2
      } else if (first < 240) {
        bits = 28
        value = first & 15
        remaining = 3
      } else {
        bits = 32
        value = 0
        remaining = 4
      }
      for (let i = 0; i < remaining; i++) value = value * 256 + byte()
      if (value >= 2 ** (bits - 1)) value -= 2 ** bits
      if (index >= count) throw new Error('ppak value overflow')
      values[index++] = value
    }
    if (index !== count) throw new Error(`ppak length mismatch: ${index}/${count}`)
    // Undo the two-dimensional first difference, one independent grid at a time.
    for (let g = 0; g < grids; g++) {
      const base = g * cols * rows
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = base + y * cols + x
          const left = x ? values[i - 1] : NaN
          const above = y ? values[i - cols] : NaN
          const diagonal = x && y ? values[i - cols - 1] : NaN
          const prediction = x && y ? left + above - diagonal : x ? left : above
          const fallback = [left, above, diagonal, 0].find(Number.isFinite)
          values[i] += Number.isFinite(prediction) ? prediction : fallback
        }
      }
    }
    for (let i = 0; i < count; i++) values[i] /= scale
    blocks.push({ type, cols, rows, grids, values })
  }
  if (offset !== buffer.length) throw new Error('Unexpected trailing EPak data')
  return { header, blocks }
}
