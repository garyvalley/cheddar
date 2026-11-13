import { crc32, deflateRawSync } from 'node:zlib'

/**
 * A zip file of a few text files, deflated: what an export downloads as. The
 * whole archive is built in memory, which suits one person's data. No
 * ZIP64, so each file and the whole archive must stay under 4 GB.
 */
export function zip(files: Record<string, string>, when = new Date()): Buffer {
  // MS-DOS time and date, as the zip format keeps them (local time, 2-second steps).
  const time = (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1)
  const date = ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate()
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, 'utf8')
    const packed = deflateRawSync(raw)
    const crc = crc32(raw)
    const fileName = Buffer.from(name, 'utf8')

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034B50, 0) // local file header
    local.writeUInt16LE(20, 4) // version needed: 2.0, deflate
    local.writeUInt16LE(0x0800, 6) // the name is UTF-8
    local.writeUInt16LE(8, 8) // deflate
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
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(date, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(packed.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(fileName.length, 28)
    // extra, comment, disk, internal and external attributes: all 0
    central.writeUInt32LE(offset, 42)

    locals.push(local, fileName, packed)
    centrals.push(central, fileName)
    offset += local.length + fileName.length + packed.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054B50, 0) // end of central directory
  const count = Object.keys(files).length
  end.writeUInt16LE(count, 8)
  end.writeUInt16LE(count, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}
