import type { H3Event } from 'h3'
import { isCategoryRef } from '~~/shared/categories'
import { amountRange } from '~~/shared/transactions'

const DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The filters a list or download of transactions takes from the query
 * (?account=&category=&from=&to=&q=&min=&max=), each optional, or a 400/404
 * for one that isn't right. `q` is words the description, name or note
 * contain; `min` and `max` are an amount's size in dollars, in or out.
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
  if (q.q !== undefined && typeof q.q !== 'string') throw createError({ statusCode: 400, statusMessage: 'Search for some words' })
  const words = (q.q ?? '').trim().replace(/\s+/g, ' ')
  if (words.length > 100) throw createError({ statusCode: 400, statusMessage: 'Search for at most 100 characters' })
  const range = amountRange(q.min, q.max)
  if ('problem' in range) throw createError({ statusCode: 400, statusMessage: range.problem })
  return {
    account, category: (q.category as string) || undefined, from: date(q.from), to: date(q.to),
    q: words || undefined, ...range.ok,
  }
}
