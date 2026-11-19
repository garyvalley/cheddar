import { investmentsReport } from '~~/server/data/reports/investments'
import { todayFor } from '~~/server/data/profile'
import { attempt, sessionFor } from '~~/server/data/session'

/**
 * GET /api/investments: the brokerage and retirement accounts, what they
 * hold, how they grew, and their value at each of the last 12 months' ends
 * (shared/investments.ts).
 */
export default defineEventHandler(async (event) => {
  const s = sessionFor(event)
  const today = await attempt(() => todayFor(s))
  return await attempt(() => investmentsReport(s, today))
})
