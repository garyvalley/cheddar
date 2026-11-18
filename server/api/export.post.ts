import { Readable } from 'node:stream'
import { exportZip } from '~~/server/data/export'
import { attempt, sessionFor } from '~~/server/data/session'

/**
 * POST /api/export { password }: everything the person has in Cheddar, as a
 * zip of spreadsheets (CSV), one JSON file and the receipts' files. It asks for the password, as
 * deleting the account does, since it's everything at once.
 */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const { password } = await readFields<{ password: string }>(event, ['password'])
  const pass = required(password, 'Your password')
  const s = sessionFor(event)
  const { chunks, day } = await attempt(() => exportZip(s, pass))
  setResponseHeader(event, 'content-type', 'application/zip')
  setResponseHeader(event, 'content-disposition', `attachment; filename="cheddar-export-${day}.zip"`)
  // Streamed: receipts' files are fetched one at a time as it goes out.
  return sendStream(event, Readable.toWeb(Readable.from(chunks)) as ReadableStream)
})
