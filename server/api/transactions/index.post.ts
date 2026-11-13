import { addTransaction, getAccount } from '~~/server/data/money'
import { attempt, sessionFor } from '~~/server/data/session'
import { checkManual } from '~~/shared/transactions'

/**
 * POST /api/transactions { account, posted, amount, direction, description,
 * payee?, note? }: a transaction added by hand, such as a cash purchase or one
 * a statement missed. `amount` is as typed ("12.34"); `direction` is "out" or
 * "in" unless the amount carries a sign. Only for an account no bank link
 * keeps: a link brings its own, and one typed in too would count twice.
 */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const body = await readFields<Record<string, unknown>>(event, ['account', 'posted', 'amount', 'direction', 'description', 'payee', 'note'])
  const id = recordId(body.account, 'No such account')
  const account = await attempt(() => getAccount(s, id), 'No such account')
  if (account.linked) throw createError({ statusCode: 400, statusMessage: `Your bank brings ${account.name}'s transactions in. Add one by hand to an account that isn't linked.` })
  const checked = checkManual(body)
  if ('problem' in checked) throw createError({ statusCode: 400, statusMessage: checked.problem })
  const transaction = await attempt(() => addTransaction(s, id, checked.ok))
  setResponseStatus(event, 201)
  return { transaction }
})
