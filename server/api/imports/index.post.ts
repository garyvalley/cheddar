import { getAccount, importRows } from '~~/server/data/money'
import { attempt, sessionFor } from '~~/server/data/session'
import { isLiability } from '~~/shared/accounts'
import { localToday } from '~~/shared/categories'
import { MAX_FILE_BYTES, readStatement, type CsvMapping } from '~~/shared/statements'

interface Body { account: string, filename: string, text: string, mapping: CsvMapping, flip: boolean }

/**
 * POST /api/imports { account, filename, text, mapping?, flip? }: a statement
 * file's transactions added to one of the caller's accounts. `text` is the
 * file, or for a PDF the text the browser took out of it (pdfText() in
 * shared/pdf-statements.ts), and `flip` turns a PDF's signs round. The file
 * is read here again, whatever the browser's preview showed; rows already in
 * the account are skipped. Answers with the import and how many lines
 * couldn't be read.
 */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const body = await readFields<Body>(event, ['account', 'filename', 'text', 'mapping', 'flip'])
  const account = recordId(body.account, 'No such account')
  const filename = typeof body.filename === 'string' ? body.filename.trim() : ''
  if (typeof body.text !== 'string' || !body.text) throw createError({ statusCode: 400, statusMessage: 'Choose a file to import.' })
  if (Buffer.byteLength(body.text) > MAX_FILE_BYTES) throw createError({ statusCode: 413, statusMessage: 'The file is too large (4 MB at most).' })
  const mapping = body.mapping && typeof body.mapping === 'object' ? body.mapping : undefined

  const into = await attempt(() => getAccount(s, account), 'No such account')
  const statement = readStatement(filename, body.text, mapping, { liability: isLiability(into.kind), flip: body.flip === true, today: localToday() })
  if ('problem' in statement) throw createError({ statusCode: 400, statusMessage: statement.problem })
  if (!statement.rows.length) throw createError({ statusCode: 400, statusMessage: 'No line of the file could be read as a transaction.' })

  const record = await attempt(() => importRows(s, account, { filename, format: statement.format, rows: statement.rows }))
  setResponseStatus(event, 201)
  return { import: record, unreadable: statement.problems.length }
})
