import { requestEmailChange } from '~~/server/data/identity'
import { attempt, sessionFor } from '~~/server/data/session'

/**
 * POST /api/auth/request-email-change { password, email }: after the current
 * password, a link to the new address that moves the account there once
 * opened, and a notice to the old one. Nothing changes until the link is used.
 */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const { password, email } = await readFields<{ password: string, email: string }>(event, ['password', 'email'])
  required(password, 'Your password')
  await attempt(() => requestEmailChange(s, password!, required(email, 'A new email')))
  setResponseStatus(event, 204)
  return null
})
