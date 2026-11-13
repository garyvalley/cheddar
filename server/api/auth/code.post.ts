import { signInWithCode } from '~~/server/data/identity'
import { toMe } from '~~/server/data/profile'
import { pocketBaseUnavailable, UNAVAILABLE } from '~~/shared/pocketbase-errors'

/**
 * POST /api/auth/code { mfaId, code }: the second step of sign-in, with a
 * code from the authenticator app or a recovery code.
 */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const { mfaId, code } = await readFields<{ mfaId: string, code: string }>(event, ['mfaId', 'code'])
  if (typeof mfaId !== 'string' || typeof code !== 'string' || !mfaId || !code.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Enter your sign-in code' })
  }
  try {
    const auth = await signInWithCode(mfaId, code.trim(), deviceHeaders(event))
    setAuthCookie(event, auth.token, auth.meta?.session)
    return { me: toMe(auth.record), recoveryCodesLeft: auth.meta?.recovery_codes_left }
  }
  catch (error) {
    if (pocketBaseUnavailable(error)) throw createError(UNAVAILABLE)
    const e = error as { status?: number, response?: { message?: string } }
    // Five wrong codes lock the codes for a while: say so, with how long.
    if (e.status === 429) throw createError({ statusCode: 429, statusMessage: e.response?.message || 'Too many wrong codes' })
    throw createError({ statusCode: 400, statusMessage: e.response?.message || 'That code is wrong or has been used' })
  }
})
