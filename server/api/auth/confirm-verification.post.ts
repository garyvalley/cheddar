import { confirmVerification } from '~~/server/data/identity'
import { attempt } from '~~/server/data/session'

/** POST /api/auth/confirm-verification { token }: confirms an address with the token from its email. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const { token } = await readFields<{ token: string }>(event, ['token'])
  await attempt(() => confirmVerification(required(token, 'A token')))
  setResponseStatus(event, 204)
  return null
})
