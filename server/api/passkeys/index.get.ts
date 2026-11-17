import { listPasskeys } from '~~/server/data/passkeys'
import { attempt, sessionFor } from '~~/server/data/session'

/** GET /api/passkeys: the caller's passkeys, oldest first. */
export default defineEventHandler(async (event) => {
  return { passkeys: await attempt(() => listPasskeys(sessionFor(event))) }
})
