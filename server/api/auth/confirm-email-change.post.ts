import { confirmEmailChange } from '~~/server/data/identity'
import { attempt } from '~~/server/data/session'

/**
 * POST /api/auth/confirm-email-change { token, password }: the token from the
 * new address's email, and the password, move the account to that address.
 * Every session ends, this browser's too, so the next sign-in uses it.
 */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const { token, password } = await readFields<{ token: string, password: string }>(event, ['token', 'password'])
  await attempt(() => confirmEmailChange(required(token, 'A token'), required(password, 'Your password')))
  clearAuthCookie(event)
  setResponseStatus(event, 204)
  return null
})
