import { yearInReview } from '~~/server/data/reports/reports'
import { todayFor } from '~~/server/data/profile'
import { attempt, sessionFor } from '~~/server/data/session'

/**
 * GET /api/reports/year?year=YYYY: a year in review (shared/reports.ts),
 * against the year before. Without a year, this one.
 */
export default defineEventHandler(async (event) => {
  const s = sessionFor(event)
  const today = await attempt(() => todayFor(s))
  const q = getQuery(event).year
  const year = q === undefined ? Number(today.slice(0, 4)) : Number(q)
  if (!Number.isInteger(year) || year < 1900 || year > Number(today.slice(0, 4)))
    throw createError({ statusCode: 400, statusMessage: 'Pick a year up to this one.' })
  return await attempt(() => yearInReview(s, year, today))
})
