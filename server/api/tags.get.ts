import { tagsBetween } from '~~/server/data/tags'
import { attempt, sessionFor } from '~~/server/data/session'

/**
 * GET /api/tags?from=&to=&account=: each tag's total over the caller's
 * counted transactions in those dates (`totals`: count, money out, money
 * in; most spent first), and every tag they've used (`known`), any date.
 * Shared accounts count, as on Spending.
 */
export default defineEventHandler(async (event) => {
  const s = sessionFor(event)
  const { from, to, account } = readTransactionQuery(event)
  return await attempt(() => tagsBetween(s, { from, to, account }))
})
