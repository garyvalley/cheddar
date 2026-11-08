import { turnOffTwoStep } from '~~/server/data/identity'
import { attempt, sessionFor } from '~~/server/data/session'

/** POST /api/auth/two-step/off { password }: two-step sign-in off; the app and recovery codes are forgotten. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const { password } = await readFields<{ password: string }>(event, ['password'])
  await attempt(() => turnOffTwoStep(sessionFor(event), required(password, 'Your password')))
  setResponseStatus(event, 204)
  return null
})
