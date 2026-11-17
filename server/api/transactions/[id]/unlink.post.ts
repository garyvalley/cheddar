import { unlinkTransaction } from '~~/server/data/transactions'
import { attempt, sessionFor } from '~~/server/data/session'

/**
 * POST /api/transactions/:id/unlink: the person says a matched transfer or
 * refund isn't one. Both sides are on their own and sorted again, and
 * neither is matched again. Answers { unlinked }. The owner's only.
 */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const id = recordId(getRouterParam(event, 'id'), 'That transaction isn\'t there.')
  return await attempt(() => unlinkTransaction(s, id), 'That transaction isn\'t there.')
})
