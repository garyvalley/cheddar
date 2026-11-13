import { confirmPassword } from '~~/server/data/identity'
import { attempt, sessionFor } from '~~/server/data/session'

/** POST /api/auth/confirm-password { password }: linking or unlinking a bank then works for 15 minutes. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const { password } = await readFields<{ password: string }>(event, ['password'])
  if (typeof password !== 'string' || !password) throw createError({ statusCode: 400, statusMessage: 'Enter your password' })
  await attempt(() => confirmPassword(sessionFor(event), password))
  setResponseStatus(event, 204)
  return null
})
