import { listTransactions } from '~~/server/data/money'
import { attempt, sessionFor } from '~~/server/data/session'

/** GET /api/transactions?account=&page=: the caller's transactions, newest first, 50 a page. */
export default defineEventHandler(async (event) => {
  const s = sessionFor(event)
  const q = getQuery(event)
  const account = q.account ? recordId(q.account, 'No such account') : undefined
  const page = Math.max(1, Math.min(10_000, Number.parseInt(String(q.page ?? '1'), 10) || 1))
  return await attempt(() => listTransactions(s, { account, page }))
})
