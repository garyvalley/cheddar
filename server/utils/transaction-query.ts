import type { H3Event } from 'h3'
import { isCategoryRef } from '~~/shared/categories'

const DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The filters a list or download of transactions takes from the query
 * (?account=&category=&from=&to=), each optional, or a 400/404 for one that
 * isn't right.
 */
export function readTransactionQuery(event: H3Event) {
  const q = getQuery(event)
  const account = q.account ? recordId(q.account, 'No such account') : undefined
  if (q.category && !isCategoryRef(q.category)) throw createError({ statusCode: 400, statusMessage: 'No such category' })
  const date = (v: unknown) => {
    if (v === undefined || v === '') return undefined
    if (typeof v !== 'string' || !DATE.test(v)) throw createError({ statusCode: 400, statusMessage: 'Dates are YYYY-MM-DD' })
    return v
  }
  return { account, category: (q.category as string) || undefined, from: date(q.from), to: date(q.to) }
}
