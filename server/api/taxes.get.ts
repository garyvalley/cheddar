import { taxes } from '~~/server/data/money'
import { todayFor } from '~~/server/data/profile'
import { attempt, sessionFor } from '~~/server/data/session'
import { defaultTaxYear, taxYearsOn } from '~~/shared/taxes'

/**
 * GET /api/taxes?year=: a tax year's income, tax payments and retirement
 * savings from the accounts' transactions (shared/taxes.ts): this year so
 * far, or last year whole. Without a year, last year's until April 15, then
 * this year's. The page works out the estimate from them, for the person's
 * filing status. Answers the year's figures and the years offered.
 */
export default defineEventHandler(async (event) => {
  const s = sessionFor(event)
  const today = await attempt(() => todayFor(s))
  const years = taxYearsOn(today)
  const asked = Number(getQuery(event).year)
  const year = years.includes(asked) ? asked : defaultTaxYear(today)
  return { ...await attempt(() => taxes(s, today, year)), years }
})
