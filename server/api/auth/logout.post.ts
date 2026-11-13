import { endThisSession } from '~~/server/data/identity'
import { pocketBaseFor } from '~~/server/data/session'

/**
 * POST /api/auth/logout: signs this device out. Its session row goes
 * (pb_hooks/sessions.pb.js), so the token is no use even if it was copied;
 * the cookies go whether or not PocketBase answers.
 */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const token = getAuthToken(event)
  if (token) {
    try {
      await endThisSession(pocketBaseFor(token, getSessionId(event)))
    }
    catch {
      // Already signed out there, or PocketBase restarting: the cookies still go.
    }
  }
  clearAuthCookie(event)
  setResponseStatus(event, 204)
  return null
})
