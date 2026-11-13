import { deleteAccount } from '~~/server/data/accounts'
import { attempt, sessionFor } from '~~/server/data/session'

/** DELETE /api/accounts/:id: the account, with its transactions and imports. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const id = recordId(getRouterParam(event, 'id'), 'No such account')
  await attempt(() => deleteAccount(s, id), 'No such account')
  setResponseStatus(event, 204)
  return null
})
