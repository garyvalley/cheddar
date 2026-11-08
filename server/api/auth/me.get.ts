import { refresh } from '~~/server/data/identity'
import { toMe } from '~~/server/data/profile'
import { pocketBaseFor } from '~~/server/data/session'
import { pocketBaseUnavailable, UNAVAILABLE } from '~~/shared/pocketbase-errors'

/**
 * GET /api/auth/me: who the cookie belongs to, or null. It renews the token,
 * so a session in use never runs out and one left alone does.
 */
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store, private')
  const token = getAuthToken(event)
  if (!token) return { me: null }
  try {
    const auth = await refresh(pocketBaseFor(token))
    setAuthCookie(event, auth.token)
    return { me: toMe(auth.record) }
  }
  catch (error) {
    // PocketBase restarting is no verdict on the token: keep the cookie.
    if (pocketBaseUnavailable(error)) throw createError(UNAVAILABLE)
    clearAuthCookie(event)
    return { me: null }
  }
})
