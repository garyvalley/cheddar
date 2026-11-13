import { ACTIVITY_SHOWN } from '~~/shared/activity'
import { listActivity } from '~~/server/data/activity'
import { attempt, sessionFor } from '~~/server/data/session'

/** GET /api/auth/activity: the person's last sign-ins and security changes, newest first. */
export default defineEventHandler(async (event) => {
  return { activity: await attempt(() => listActivity(sessionFor(event), ACTIVITY_SHOWN)) }
})
