import { editTransaction, getTransaction } from '~~/server/data/money'
import { attempt, sessionFor } from '~~/server/data/session'
import { checkEdit } from '~~/shared/transactions'

const GONE = 'That transaction isn\'t there.'

/**
 * PATCH /api/transactions/:id { payee?, note?, excluded?, posted?, amount?,
 * direction?, description? }: changes what the person may change. Any
 * transaction takes a name (`payee`), a note, and `excluded` to leave it out
 * of spending, Overview, Projections and Taxes; one added by hand takes its
 * date, amount and description too. Its category moves only through
 * POST /api/transactions/:id/category.
 */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const id = recordId(getRouterParam(event, 'id'), GONE)
  const body = await readFields<Record<string, unknown>>(event, ['payee', 'note', 'excluded', 'posted', 'amount', 'direction', 'description'])
  const current = await attempt(() => getTransaction(s, id), GONE)
  const checked = checkEdit(body, current.source === 'manual')
  if ('problem' in checked) throw createError({ statusCode: 400, statusMessage: checked.problem })
  return { transaction: await attempt(() => editTransaction(s, id, checked.ok), GONE) }
})
