import { syncLink } from '~~/server/data/bank-links'
import { attempt, sessionFor } from '~~/server/data/session'

/** POST /api/bank-links/:id/sync { reconnected? }: fetches the link's balances and new transactions now. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const body = await readBody<{ reconnected?: unknown } | null>(event).catch(() => null)
  return attempt(() => syncLink(s, getRouterParam(event, 'id') ?? '', body?.reconnected === true), 'That link isn\'t there.')
})
