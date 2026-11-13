import { periodOf } from '~~/shared/categories'
import { todayFor } from '~~/server/data/profile'
import { spendingSummary } from '~~/server/data/money'
import { attempt, sessionFor } from '~~/server/data/session'

/**
 * GET /api/spending?period=month|year&at=2026-11|2026&account=: what each
 * category came to in that month or year (this month by default), with the
 * period before's spending to compare.
 */
export default defineEventHandler(async (event) => {
  const s = sessionFor(event)
  const q = getQuery(event)
  const account = q.account ? recordId(q.account, 'No such account') : undefined
  const kind = q.period === 'year' ? 'year' : 'month'
  const today = await attempt(() => todayFor(s))
  const p = periodOf(kind, typeof q.at === 'string' ? q.at : undefined, today)
  const before = periodOf(kind, p.prev, today)
  return await attempt(() => spendingSummary(s, { account, from: p.from, to: p.to, previous: { from: before.from, to: before.to } }))
})
