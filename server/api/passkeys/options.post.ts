import { passkeyOptions } from '~~/server/data/passkeys'
import { attempt, sessionFor } from '~~/server/data/session'

/** POST /api/passkeys/options { password }: starts adding a passkey; answers what the browser asks the device. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const { password } = await readFields<{ password: string }>(event, ['password'])
  return attempt(() => passkeyOptions(sessionFor(event), required(password, 'Your password')))
})
