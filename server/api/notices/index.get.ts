import { noticesFor } from '~~/server/data/reports/notices'
import { attempt, sessionFor } from '~~/server/data/session'

/**
 * GET /api/notices: the bell's list (shared/notices.ts), worked out now
 * from the caller's data, with the keys of the ones they haven't seen and
 * the kinds they turned off.
 */
export default defineEventHandler(async (event) => {
  const s = sessionFor(event)
  return await attempt(() => noticesFor(s))
})
