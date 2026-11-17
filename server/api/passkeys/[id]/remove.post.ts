import { removePasskey } from '~~/server/data/passkeys'
import { attempt, sessionFor } from '~~/server/data/session'

/** POST /api/passkeys/:id/remove: the passkey can't sign in any more. 204. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const id = recordId(getRouterParam(event, 'id'), 'That passkey isn\'t there.')
  await attempt(() => removePasskey(sessionFor(event), id), 'That passkey isn\'t there.')
  setResponseStatus(event, 204)
  return null
})
