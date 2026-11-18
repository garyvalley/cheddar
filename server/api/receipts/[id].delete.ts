import { deleteReceipt } from '~~/server/data/receipts'
import { attempt, sessionFor } from '~~/server/data/session'

/** DELETE /api/receipts/:id: deletes one of the caller's receipts. Answers 204. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const id = recordId(getRouterParam(event, 'id'), 'That receipt isn\'t there.')
  await attempt(() => deleteReceipt(s, id), 'That receipt isn\'t there.')
  setResponseStatus(event, 204)
  return null
})
