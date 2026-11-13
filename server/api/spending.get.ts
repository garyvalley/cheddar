import { isPeriodKind, periodOf } from '~~/shared/categories'
import { todayFor } from '~~/server/data/profile'
import { spendingSummary } from '~~/server/data/money'
import { attempt, sessionFor } from '~~/server/data/session'

/**
 * GET /api/spending?period=week|month|year|custom&at=&account=: what each
 * category came to in that week (`at` its Monday), month (2026-11), year
 * (2026) or range (2026-01-05~2026-02-10), this month by default, with the
 * span before's spending to compare and each category's budget for the span.
 */
export default defineEventHandler(async (event) => {
  const s = sessionFor(event)
  const q = getQuery(event)
  const account = q.account ? recordId(q.account, 'No such account') : undefined
  const kind = isPeriodKind(q.period) ? q.period : 'month'
  const today = await attempt(() => todayFor(s))
  const p = periodOf(kind, typeof q.at === 'string' ? q.at : undefined, today)
  const before = periodOf(kind, p.prev, today)
  return await attempt(() => spendingSummary(s, { account, from: p.from, to: p.to, previous: { from: before.from, to: before.to } }))
})
