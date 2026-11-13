import { overview } from '~~/server/data/money'
import { todayFor } from '~~/server/data/profile'
import { attempt, sessionFor } from '~~/server/data/session'

/**
 * GET /api/overview: net worth from the accounts' balances, the last 12
 * months' income and spending, and the investment accounts' growth
 * (shared/overview.ts).
 */
export default defineEventHandler(async (event) => {
  const s = sessionFor(event)
  const today = await attempt(() => todayFor(s))
  return await attempt(() => overview(s, today))
})
