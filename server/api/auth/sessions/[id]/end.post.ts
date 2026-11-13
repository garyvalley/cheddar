import { endSession, listSessions } from '~~/server/data/identity'
import { attempt, sessionFor } from '~~/server/data/session'

/** POST /api/auth/sessions/:id/end: signs that device out. Signing out this one also forgets the cookies. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const id = recordId(getRouterParam(event, 'id'))
  const s = sessionFor(event)
  const current = (await attempt(() => listSessions(s))).find(x => x.current)
  await attempt(() => endSession(s, id))
  if (current?.id === id) clearAuthCookie(event)
  setResponseStatus(event, 204)
  return null
})
