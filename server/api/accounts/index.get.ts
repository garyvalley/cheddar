import { listAccounts } from '~~/server/data/money'
import { attempt, sessionFor } from '~~/server/data/session'

/** GET /api/accounts: the caller's accounts, by name. */
export default defineEventHandler(async (event) => {
  const s = sessionFor(event)
  return { accounts: await attempt(() => listAccounts(s)) }
})
