import { getAccount, importRows } from '~~/server/data/money'
import { attempt, sessionFor } from '~~/server/data/session'
import { MAX_FILE_BYTES, readStatement, type CsvMapping } from '~~/shared/statements'

interface Body { account: string, filename: string, text: string, mapping: CsvMapping }

/**
 * POST /api/imports { account, filename, text, mapping? }: a statement file's
 * transactions added to one of the caller's accounts. The file is read here
 * again, whatever the browser's preview showed; rows already in the account
 * are skipped. Answers with the import and how many lines couldn't be read.
 */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const body = await readFields<Body>(event, ['account', 'filename', 'text', 'mapping'])
  const account = recordId(body.account, 'No such account')
  const filename = typeof body.filename === 'string' ? body.filename.trim() : ''
  if (typeof body.text !== 'string' || !body.text) throw createError({ statusCode: 400, statusMessage: 'Choose a file to import.' })
  if (Buffer.byteLength(body.text) > MAX_FILE_BYTES) throw createError({ statusCode: 413, statusMessage: 'The file is too large (4 MB at most).' })
  const mapping = body.mapping && typeof body.mapping === 'object' ? body.mapping : undefined

  await attempt(() => getAccount(s, account), 'No such account')
  const statement = readStatement(filename, body.text, mapping)
  if ('problem' in statement) throw createError({ statusCode: 400, statusMessage: statement.problem })
  if (!statement.rows.length) throw createError({ statusCode: 400, statusMessage: 'No line of the file could be read as a transaction.' })

  const record = await attempt(() => importRows(s, account, { filename, format: statement.format, rows: statement.rows }))
  setResponseStatus(event, 201)
  return { import: record, unreadable: statement.problems.length }
})
