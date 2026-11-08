import { syncLink } from '~~/server/data/bank-links'
import { attempt, sessionFor } from '~~/server/data/session'

/** POST /api/bank-links/:id/sync: fetches the link's balances and transactions now. */
export default defineEventHandler((event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  return attempt(() => syncLink(s, getRouterParam(event, 'id') ?? ''), 'That link isn\'t there.')
})
