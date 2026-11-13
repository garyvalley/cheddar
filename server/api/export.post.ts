import { exportZip } from '~~/server/data/export'
import { localToday } from '~~/shared/categories'
import { attempt, sessionFor } from '~~/server/data/session'

/**
 * POST /api/export { password }: everything the person has in Cheddar, as a
 * zip of spreadsheets (CSV) and one JSON file. It asks for the password, as
 * deleting the account does, since it's everything at once.
 */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const { password } = await readFields<{ password: string }>(event, ['password'])
  const pass = required(password, 'Your password')
  const s = sessionFor(event)
  const file = await attempt(() => exportZip(s, pass))
  setResponseHeader(event, 'content-type', 'application/zip')
  setResponseHeader(event, 'content-disposition', `attachment; filename="cheddar-export-${localToday()}.zip"`)
  return file
})
