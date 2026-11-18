import { addReceipt } from '~~/server/data/receipts'
import { getTransaction } from '~~/server/data/transactions'
import { attempt, sessionFor } from '~~/server/data/session'
import { checkReceipt } from '~~/shared/receipts'

const GONE = 'That transaction isn\'t there.'

/**
 * POST /api/transactions/:id/receipts (multipart: `file`, and `name`):
 * keeps a receipt with one of the caller's own transactions, at full size.
 * What the file is comes from its first bytes (shared/receipts.ts), never
 * from the browser. Answers { receipt }.
 */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const id = recordId(getRouterParam(event, 'id'), GONE)
  const parts = (await readMultipartFormData(event).catch(() => undefined)) ?? []
  const file = parts.find(p => p.name === 'file')
  if (!file) throw createError({ statusCode: 400, statusMessage: 'Choose a photo or a PDF of the receipt.' })
  const name = parts.find(p => p.name === 'name')?.data.toString('utf8') || file.filename || ''
  const checked = checkReceipt(name, file.data)
  if ('problem' in checked) throw createError({ statusCode: 400, statusMessage: checked.problem })
  const t = await attempt(() => getTransaction(s, id), GONE)
  if (t.shared) throw createError({ statusCode: 403, statusMessage: 'Only the account\'s owner can add receipts to it.' })
  const receipt = await attempt(() => addReceipt(s, id, { ...checked.ok, bytes: file.data }), GONE)
  setResponseStatus(event, 201)
  return { receipt }
})
