import { setNoticesOff } from '~~/server/data/reports/notices'
import { attempt, sessionFor } from '~~/server/data/session'
import { checkOff } from '~~/shared/notices'

/** PUT /api/notices/settings { off }: the kinds of notice the caller doesn't want in the bell. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const body = await readFields<{ off: unknown }>(event, ['off'])
  const checked = checkOff(body.off)
  if ('problem' in checked) throw createError({ statusCode: 400, statusMessage: checked.problem })
  return { off: await attempt(() => setNoticesOff(s, checked.ok)) }
})
