import { confirmApp } from '~~/server/data/identity'
import { attempt, sessionFor } from '~~/server/data/session'

/** POST /api/auth/two-step/app/confirm { code }: the app's first code turns two-step sign-in on; answers the recovery codes. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const { code } = await readFields<{ code: string }>(event, ['code'])
  return attempt(() => confirmApp(sessionFor(event), required(code, 'A code')))
})
