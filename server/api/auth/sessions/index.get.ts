import { listSessions } from '~~/server/data/identity'
import { attempt, sessionFor } from '~~/server/data/session'

/** GET /api/auth/sessions: the devices signed in to this account, this one marked `current`. */
export default defineEventHandler(async (event) => {
  return { sessions: await attempt(() => listSessions(sessionFor(event))) }
})
