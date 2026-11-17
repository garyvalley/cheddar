import { checkRange, rangeMonths } from '~~/shared/reports'
import { trends } from '~~/server/data/reports/reports'
import { todayFor } from '~~/server/data/profile'
import { attempt, sessionFor } from '~~/server/data/session'

/**
 * GET /api/reports?from=YYYY-MM&to=YYYY-MM: Reports' trends over those
 * months (shared/reports.ts): each month's income and spending, each
 * spending category and the top merchants month by month, and where the
 * income went. Without them, the last 12 months, this one included.
 */
export default defineEventHandler(async (event) => {
  const s = sessionFor(event)
  const q = getQuery(event)
  let from = q.from
  let to = q.to
  if (from === undefined && to === undefined) {
    const today = await attempt(() => todayFor(s))
    ;({ from, to } = rangeMonths('12m', today))
  }
  const range = checkRange(from, to)
  if ('problem' in range) throw createError({ statusCode: 400, statusMessage: range.problem })
  return await attempt(() => trends(s, range.from, range.to))
})
