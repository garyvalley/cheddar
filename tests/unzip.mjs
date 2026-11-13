// Reads a zip's files back, for the tests of server/data/zip.ts and of the
// export route; not itself a test file. Walks the central directory, as an
// unzip tool does, and checks each file's CRC.

import { crc32, inflateRawSync } from 'node:zlib'

/** { name: text } for every file in `buf`; throws on anything malformed. */
export function unzip(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4B, 0x05, 0x06]))
  if (end < 0) throw new Error('no end of central directory')
  const count = buf.readUInt16LE(end + 10)
  let at = buf.readUInt32LE(end + 16)
  const files = {}
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(at) !== 0x02014B50) throw new Error('bad central header')
    const method = buf.readUInt16LE(at + 10)
    const crc = buf.readUInt32LE(at + 16)
    const size = buf.readUInt32LE(at + 20)
    const nameLen = buf.readUInt16LE(at + 28)
    const extra = buf.readUInt16LE(at + 30)
    const comment = buf.readUInt16LE(at + 32)
    const local = buf.readUInt32LE(at + 42)
    const name = buf.subarray(at + 46, at + 46 + nameLen).toString('utf8')
    if (buf.readUInt32LE(local) !== 0x04034B50) throw new Error('bad local header')
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const packed = buf.subarray(start, start + size)
    const raw = method === 8 ? inflateRawSync(packed) : packed
    if (crc32(raw) !== crc) throw new Error(`bad CRC for ${name}`)
    files[name] = raw.toString('utf8')
    at += 46 + nameLen + extra + comment
  }
  return files
}
