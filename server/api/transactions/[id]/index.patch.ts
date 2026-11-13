import { editTransaction, getTransaction } from '~~/server/data/transactions'
import { listCategories } from '~~/server/data/categories'
import { attempt, sessionFor } from '~~/server/data/session'
import { checkSplit, type SplitPart } from '~~/shared/splits'
import { checkEdit, type EditFields } from '~~/shared/transactions'

const GONE = 'That transaction isn\'t there.'

/**
 * PATCH /api/transactions/:id { payee?, note?, excluded?, posted?, amount?,
 * direction?, description?, splits? }: changes what the person may change.
 * Any transaction takes a name (`payee`), a note, `excluded` to leave it out
 * of spending, Overview, Projections and Taxes, and `splits` to split it
 * across categories ([{ category, amount }], each amount's size without a
 * sign, adding up to the whole; [] undoes it). One added by hand takes its
 * date, amount and description too. Its category moves only through
 * POST /api/transactions/:id/category.
 */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const id = recordId(getRouterParam(event, 'id'), GONE)
  const { splits, ...body } = await readFields<Record<string, unknown>>(event, ['payee', 'note', 'excluded', 'posted', 'amount', 'direction', 'description', 'splits'])
  const current = await attempt(() => getTransaction(s, id), GONE)
  let change: EditFields = {}
  if (splits === undefined || Object.values(body).some(v => v !== undefined)) {
    const checked = checkEdit(body, current.source === 'manual')
    if ('problem' in checked) throw createError({ statusCode: 400, statusMessage: checked.problem })
    change = checked.ok
  }
  let parts: SplitPart[] | undefined
  if (splits !== undefined) {
    const ids = new Set((await attempt(() => listCategories(s))).map(c => c.id))
    const checked = checkSplit(splits, change.amount_cents ?? current.amount_cents, id => ids.has(id))
    if ('problem' in checked) throw createError({ statusCode: 400, statusMessage: checked.problem })
    parts = checked.ok
  }
  return { transaction: await attempt(() => editTransaction(s, id, { ...change, splits: parts }), GONE) }
})
