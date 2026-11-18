import { receiptFile } from '~~/server/data/receipts'
import { attempt, sessionFor } from '~~/server/data/session'

/**
 * GET /api/receipts/:id: the receipt's file, shown in the browser (or saved
 * with ?download=1). It's never run as a page: a sandbox and nosniff.
 */
export default defineEventHandler(async (event) => {
  const s = sessionFor(event)
  const id = recordId(getRouterParam(event, 'id'), 'That receipt isn\'t there.')
  const file = await attempt(() => receiptFile(s, id), 'That receipt isn\'t there.')
  const name = file.name.replace(/[^\w .-]+/g, '_') || 'receipt'
  setResponseHeaders(event, {
    'content-type': file.type,
    'content-length': file.bytes.length,
    'content-disposition': `${getQuery(event).download ? 'attachment' : 'inline'}; filename="${name}"`,
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': 'sandbox; default-src \'none\'; img-src \'self\'; style-src \'unsafe-inline\'',
  })
  return file.bytes
})
