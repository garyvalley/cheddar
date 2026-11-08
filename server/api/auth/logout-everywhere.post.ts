import { signOutEverywhere } from '~~/server/data/identity'
import { attempt, sessionFor } from '~~/server/data/session'

/** POST /api/auth/logout-everywhere: ends every session the account has, this one too. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  await attempt(() => signOutEverywhere(sessionFor(event)))
  clearAuthCookie(event)
  setResponseStatus(event, 204)
  return null
})
