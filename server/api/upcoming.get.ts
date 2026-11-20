import { todayFor } from '~~/server/data/profile'
import { forecastAhead } from '~~/server/data/reports/upcoming'
import { attempt, sessionFor } from '~~/server/data/session'
import { upcoming, UPCOMING_DAYS } from '~~/shared/upcoming'

/**
 * GET /api/upcoming: Spending's "Coming up" (shared/upcoming.ts): the next
 * week of the cash-flow forecast, from the caller's own accounts as Cash
 * flow reads them, and recent price rises in their recurring charges.
 */
export default defineEventHandler(async (event) => {
  const s = sessionFor(event)
  const today = await attempt(() => todayFor(s))
  const { events, detected } = await attempt(() => forecastAhead(s, today, UPCOMING_DAYS))
  return upcoming(events, detected, today)
})
