import { removeLink } from '~~/server/data/bank-links'
import { attempt, sessionFor } from '~~/server/data/session'

/** POST /api/bank-links/:id/remove: stops syncing; the accounts and their transactions stay. Answers 204. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  await attempt(() => removeLink(s, getRouterParam(event, 'id') ?? ''), 'That link isn\'t there.')
  setResponseStatus(event, 204)
  return null
})
