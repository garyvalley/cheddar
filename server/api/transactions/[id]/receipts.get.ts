import { listReceipts } from '~~/server/data/receipts'
import { attempt, sessionFor } from '~~/server/data/session'

/** GET /api/transactions/:id/receipts: its receipts (not their files), oldest first. The owner's only. */
export default defineEventHandler(async (event) => {
  const s = sessionFor(event)
  const id = recordId(getRouterParam(event, 'id'), 'That transaction isn\'t there.')
  return { receipts: await attempt(() => listReceipts(s, id)) }
})
