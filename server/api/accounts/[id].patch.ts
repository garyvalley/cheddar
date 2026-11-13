import { todayFor } from '~~/server/data/profile'
import { getAccount, updateAccount } from '~~/server/data/money'
import { attempt, sessionFor } from '~~/server/data/session'
import { checkAccountChange, parseBalance, type AccountChange } from '~~/shared/accounts'

type Body = AccountChange & { balance: unknown }

/**
 * PATCH /api/accounts/:id { balance?, name?, kind?, institution?, last4?,
 * closed_on?, excluded? }: any of them, alone or together.
 *
 * - `balance`: what an account no bank link keeps up to date holds today
 *   ("1,234.56"; for a card or loan, what's owed).
 * - `name`, `kind`, `institution`, `last4`: as a new account's. A linked
 *   account's are the person's too after its first sync. A kind that moves
 *   between money held and money owed turns its balances round
 *   (pb_hooks/balances.pb.js).
 * - `closed_on`: the day it closed (no later than today), or '' to open it again.
 * - `excluded`: true leaves it out of every page's numbers.
 */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const id = recordId(getRouterParam(event, 'id'), 'No such account')
  const body = await readFields<Body>(event, ['balance', 'name', 'kind', 'institution', 'last4', 'closed_on', 'excluded'])
  const account = await attempt(() => getAccount(s, id), 'No such account')
  const today = await attempt(() => todayFor(s))
  const checked = checkAccountChange(body, account, today)
  if ('problem' in checked) throw createError({ statusCode: 400, statusMessage: checked.problem })
  const change: AccountChange & { balance_cents?: number, balance_date?: string } = { ...checked.ok }
  const kind = change.kind ?? account.kind
  if (body.balance !== undefined) {
    if (account.linked) throw createError({ statusCode: 400, statusMessage: 'Its bank keeps this account\'s balance up to date.' })
    const parsed = parseBalance(body.balance, kind)
    if ('problem' in parsed) throw createError({ statusCode: 400, statusMessage: parsed.problem })
    Object.assign(change, { balance_cents: parsed.ok, balance_date: today })
  }
  if (!Object.keys(change).length) return { account }
  return { account: await attempt(() => updateAccount(s, id, change), 'No such account') }
})
