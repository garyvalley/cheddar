import { signInOptions } from '~~/server/data/passkeys'
import { attempt } from '~~/server/data/session'

/** POST /api/auth/passkey/options: what the browser asks the device, to sign in with any of this site's passkeys. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  return attempt(() => signInOptions(deviceHeaders(event)))
})
