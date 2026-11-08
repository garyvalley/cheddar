import { deleteAccount } from '~~/server/data/identity'
import { attempt, sessionFor } from '~~/server/data/session'

/** POST /api/auth/delete-account { password }: deletes the account and everything in it. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const { password } = await readFields<{ password: string }>(event, ['password'])
  await attempt(() => deleteAccount(sessionFor(event), required(password, 'Your password')))
  clearAuthCookie(event)
  setResponseStatus(event, 204)
  return null
})
