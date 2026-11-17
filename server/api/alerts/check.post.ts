import { checkAlertsNow } from '~~/server/data/alerts'
import { attempt, sessionFor } from '~~/server/data/session'

/** POST /api/alerts/check: looks for alerts now and emails what's new. Answers { sent }, each in words. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  return await attempt(() => checkAlertsNow(s))
})
