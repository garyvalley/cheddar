import { markSeen } from '~~/server/data/reports/notices'
import { attempt, sessionFor } from '~~/server/data/session'
import { checkSeen } from '~~/shared/notices'

/** POST /api/notices/seen { keys }: the bell was opened, and these are the notices it showed. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const body = await readFields<{ keys: unknown }>(event, ['keys'])
  const checked = checkSeen(body.keys)
  if ('problem' in checked) throw createError({ statusCode: 400, statusMessage: checked.problem })
  await attempt(() => markSeen(s, checked.ok))
  return { seen: checked.ok.length }
})
