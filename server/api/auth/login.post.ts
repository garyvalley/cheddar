import { signInWithPassword } from '~~/server/data/identity'
import { toMe } from '~~/server/data/profile'
import { pocketBaseUnavailable, UNAVAILABLE } from '~~/shared/pocketbase-errors'

/**
 * POST /api/auth/login { email, password }. The token goes into the httpOnly
 * cookie and only the person comes back; with two-step sign-in on, an mfaId
 * comes back instead, for /api/auth/code. The mfaId is no credential: the
 * code is still needed.
 */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const { email, password } = await readFields<{ email: string, password: string }>(event, ['email', 'password'])
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Email and password are required' })
  }
  try {
    const result = await signInWithPassword(email, password, deviceHeaders(event))
    if ('mfaId' in result) return { twoStep: { mfaId: result.mfaId } }
    setAuthCookie(event, result.token, result.session)
    return { me: toMe(result.record) }
  }
  catch (error) {
    if (pocketBaseUnavailable(error)) throw createError(UNAVAILABLE)
    // Deliberately the same for an unknown address and a wrong password.
    throw createError({ statusCode: 400, statusMessage: 'Invalid email or password' })
  }
})
