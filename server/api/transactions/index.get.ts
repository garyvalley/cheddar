import { isCategoryRef } from '~~/shared/categories'
import { listTransactions } from '~~/server/data/money'
import { attempt, sessionFor } from '~~/server/data/session'

const DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/transactions?account=&category=&from=&to=&page=: the caller's
 * transactions, newest first, 50 a page; each filter is optional.
 */
export default defineEventHandler(async (event) => {
  const s = sessionFor(event)
  const q = getQuery(event)
  const account = q.account ? recordId(q.account, 'No such account') : undefined
  if (q.category && !isCategoryRef(q.category)) throw createError({ statusCode: 400, statusMessage: 'No such category' })
  const date = (v: unknown) => {
    if (v === undefined || v === '') return undefined
    if (typeof v !== 'string' || !DATE.test(v)) throw createError({ statusCode: 400, statusMessage: 'Dates are YYYY-MM-DD' })
    return v
  }
  const page = Math.max(1, Math.min(10_000, Number.parseInt(String(q.page ?? '1'), 10) || 1))
  return await attempt(() => listTransactions(s, {
    account, category: (q.category as string) || undefined, from: date(q.from), to: date(q.to), page,
  }))
})
