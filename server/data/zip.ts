import { crc32, deflateRawSync } from 'node:zlib'

/**
 * A zip file, written one file at a time: what an export downloads as. Only
 * the file being added is held in memory, so a person's receipts (each up to
 * 10 MB) stream through without the whole archive ever being built. Text
 * files are deflated; photos and PDFs, already compressed, are stored. No
 * ZIP64, so each file and the whole archive must stay under 4 GB.
 */

export type ZipEntry = [name: string, content: string | Uint8Array]

/** DOS time and date, as the zip format keeps them (local time, 2-second steps). */
function dosTime(when: Date) {
  return {
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1),
    date: ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
  }
}

/** The zip's bytes, in pieces, as each entry arrives. */
export async function* zipChunks(entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>, when = new Date()): AsyncGenerator<Buffer> {
  const { time, date } = dosTime(when)
  const centrals: Buffer[] = []
  let offset = 0
  let count = 0
  for await (const [name, content] of entries) {
    const text = typeof content === 'string'
    const raw = text ? Buffer.from(content, 'utf8') : Buffer.from(content.buffer, content.byteOffset, content.byteLength)
    const method = text ? 8 : 0 // deflate text; store what's compressed already
    const packed = method ? deflateRawSync(raw) : raw
    const crc = crc32(raw)
    const fileName = Buffer.from(name, 'utf8')

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034B50, 0) // local file header
    local.writeUInt16LE(20, 4) // version needed: 2.0
    local.writeUInt16LE(0x0800, 6) // the name is UTF-8
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(fileName.length, 26)
    local.writeUInt16LE(0, 28) // no extra field

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014B50, 0) // central directory header
    central.writeUInt16LE(20, 4) // made by: 2.0
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(date, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(packed.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(fileName.length, 28)
    // extra, comment, disk, internal and external attributes: all 0
    central.writeUInt32LE(offset, 42)

    yield Buffer.concat([local, fileName])
    yield packed
    centrals.push(central, fileName)
    offset += local.length + fileName.length + packed.length
    count++
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054B50, 0) // end of central directory
  end.writeUInt16LE(count, 8)
  end.writeUInt16LE(count, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  yield Buffer.concat([directory, end])
}

/** A whole zip at once, for a few small files. */
export async function zip(files: Record<string, string | Uint8Array>, when = new Date()): Promise<Buffer> {
  const parts: Buffer[] = []
  for await (const part of zipChunks(Object.entries(files), when)) parts.push(part)
  return Buffer.concat(parts)
}
