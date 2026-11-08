import { setUpApp } from '~~/server/data/identity'
import { attempt, sessionFor } from '~~/server/data/session'

/** POST /api/auth/two-step/app { password }: starts setting up an authenticator app; answers its secret and QR address. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const { password } = await readFields<{ password: string }>(event, ['password'])
  return attempt(() => setUpApp(sessionFor(event), required(password, 'Your password')))
})
