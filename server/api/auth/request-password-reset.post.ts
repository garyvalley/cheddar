import { requestPasswordReset } from '~~/server/data/identity'
import { attempt } from '~~/server/data/session'

/** POST /api/auth/request-password-reset { email }: Email a link to choose a new password. Answers 204 whether or not the address has an account. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const { email } = await readFields<{ email: string }>(event, ['email'])
  await attempt(() => requestPasswordReset(required(email, 'Email')))
  setResponseStatus(event, 204)
  return null
})
