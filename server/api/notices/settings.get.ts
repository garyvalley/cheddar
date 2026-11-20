import { noticeState } from '~~/server/data/reports/notices'
import { attempt, sessionFor } from '~~/server/data/session'

/** GET /api/notices/settings: the kinds of notice the caller turned off in the bell. */
export default defineEventHandler(async (event) => {
  const s = sessionFor(event)
  return { off: (await attempt(() => noticeState(s))).off }
})
