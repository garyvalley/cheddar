import { newRecoveryCodes } from '~~/server/data/identity'
import { attempt, sessionFor } from '~~/server/data/session'

/** POST /api/auth/two-step/recovery-codes { password }: new recovery codes; the old ones stop working. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const { password } = await readFields<{ password: string }>(event, ['password'])
  return attempt(() => newRecoveryCodes(sessionFor(event), required(password, 'Your password')))
})
