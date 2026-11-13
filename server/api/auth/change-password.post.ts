import { changePassword } from '~~/server/data/identity'
import { attempt, sessionFor } from '~~/server/data/session'
import { passwordProblem } from '~~/shared/passwords'

/**
 * POST /api/auth/change-password { password, newPassword }: a new password,
 * after the current one. Every other session ends, and this one carries on
 * with a fresh token in its cookie.
 */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const { password, newPassword } = await readFields<{ password: string, newPassword: string }>(event, ['password', 'newPassword'])
  required(password, 'Your current password')
  const problem = passwordProblem(required(newPassword, 'A new password'))
  if (problem) throw createError({ statusCode: 400, statusMessage: problem })
  setAuthCookie(event, await attempt(() => changePassword(s, password!, newPassword!)))
  setResponseStatus(event, 204)
  return null
})
