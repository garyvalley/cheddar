import { confirmPasswordReset } from '~~/server/data/identity'
import { attempt } from '~~/server/data/session'
import { passwordProblem } from '~~/shared/passwords'

/**
 * POST /api/auth/confirm-password-reset { token, password }: the new
 * password, with the token from the email. Every session the account had
 * ends, because PocketBase changes the account's token key with it.
 */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const { token, password } = await readFields<{ token: string, password: string }>(event, ['token', 'password'])
  const problem = passwordProblem(required(password, 'A password'))
  if (problem) throw createError({ statusCode: 400, statusMessage: problem })
  await attempt(() => confirmPasswordReset(required(token, 'A token'), password!))
  setResponseStatus(event, 204)
  return null
})
