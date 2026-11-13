import { recurringCharges } from '~~/server/data/money'
import { todayFor } from '~~/server/data/profile'
import { attempt, sessionFor } from '~~/server/data/session'

/**
 * GET /api/recurring?account=: the subscriptions and bills found in the
 * caller's spending (shared/recurring.ts), in one account or all of them:
 * each one's amount, how often, when it's next due and what it costs a year,
 * a price change, and the ones that stopped.
 */
export default defineEventHandler(async (event) => {
  const s = sessionFor(event)
  const q = getQuery(event)
  const account = q.account ? recordId(q.account, 'No such account') : undefined
  const today = await attempt(() => todayFor(s))
  return await attempt(() => recurringCharges(s, account, today))
})
