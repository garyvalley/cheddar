import { getAccount, setBalance } from '~~/server/data/money'
import { attempt, sessionFor } from '~~/server/data/session'
import { parseBalance } from '~~/shared/accounts'
import { localToday } from '~~/shared/categories'

/**
 * PATCH /api/accounts/:id { balance }: what an account holds today, for one
 * no bank link keeps up to date ("1,234.56"; for a card or loan, what's owed).
 */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const id = recordId(getRouterParam(event, 'id'), 'No such account')
  const { balance } = await readFields<{ balance: unknown }>(event, ['balance'])
  const account = await attempt(() => getAccount(s, id), 'No such account')
  if (account.linked) throw createError({ statusCode: 400, statusMessage: 'Its bank keeps this account\'s balance up to date.' })
  const parsed = parseBalance(balance, account.kind)
  if ('problem' in parsed) throw createError({ statusCode: 400, statusMessage: parsed.problem })
  return { account: await attempt(() => setBalance(s, id, parsed.ok, localToday()), 'No such account') }
})
