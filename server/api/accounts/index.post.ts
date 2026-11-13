import { createAccount } from '~~/server/data/accounts'
import { attempt, sessionFor } from '~~/server/data/session'
import { checkAccount, type NewAccount } from '~~/shared/accounts'

/** POST /api/accounts { name, kind, institution?, last4? }: an account added by hand. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const checked = checkAccount(await readFields<NewAccount>(event, ['name', 'kind', 'institution', 'last4']))
  if ('problem' in checked) throw createError({ statusCode: 400, statusMessage: checked.problem })
  const account = await attempt(() => createAccount(s, checked.ok))
  setResponseStatus(event, 201)
  return { account }
})
