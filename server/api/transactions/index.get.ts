import { listTransactions } from '~~/server/data/money'
import { attempt, sessionFor } from '~~/server/data/session'

/**
 * GET /api/transactions?account=&category=&from=&to=&q=&min=&max=&page=: the
 * caller's transactions, newest first, 50 a page; each filter is optional
 * (server/utils/transaction-query.ts). Ones left out of the totals are listed
 * too, marked `excluded`.
 */
export default defineEventHandler(async (event) => {
  const s = sessionFor(event)
  const query = readTransactionQuery(event)
  const page = Math.max(1, Math.min(10_000, Number.parseInt(String(getQuery(event).page ?? '1'), 10) || 1))
  return await attempt(() => listTransactions(s, { ...query, page }))
})
