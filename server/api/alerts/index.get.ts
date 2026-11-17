import { getAlertSettings } from '~~/server/data/alerts'
import { attempt, sessionFor } from '~~/server/data/session'

/** GET /api/alerts: the caller's alert settings (shared/alerts.ts), all off until they choose. */
export default defineEventHandler(async (event) => {
  const s = sessionFor(event)
  return { settings: await attempt(() => getAlertSettings(s)) }
})
