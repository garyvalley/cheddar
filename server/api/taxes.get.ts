import { taxes } from '~~/server/data/money'
import { attempt, sessionFor } from '~~/server/data/session'

/**
 * GET /api/taxes: this year's income, tax payments and retirement savings so
 * far, from the accounts' transactions (shared/taxes.ts). The page works out
 * the estimate from them, for the person's filing status.
 */
export default defineEventHandler(async (event) => {
  const s = sessionFor(event)
  return await attempt(() => taxes(s))
})
