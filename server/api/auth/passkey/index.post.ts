import { signInWithPasskey } from '~~/server/data/passkeys'
import { toMe } from '~~/server/data/profile'
import type { PasskeyAnswer } from '~~/shared/passkeys'
import { pocketBaseUnavailable, UNAVAILABLE } from '~~/shared/pocketbase-errors'

/**
 * POST /api/auth/passkey { challengeId, credential, mfaId? }: signs in with
 * a passkey, on its own or as the second step after the password (`mfaId`).
 * The token goes into the httpOnly cookie, as with a code.
 */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const body = await readFields<{ challengeId: string, credential: PasskeyAnswer, mfaId: string }>(event, ['challengeId', 'credential', 'mfaId'])
  if (typeof body.challengeId !== 'string' || !body.credential || typeof body.credential !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'That passkey request has expired. Try again.' })
  }
  try {
    const auth = await signInWithPasskey(body.challengeId, body.credential, typeof body.mfaId === 'string' ? body.mfaId : '', deviceHeaders(event))
    setAuthCookie(event, auth.token, auth.meta?.session)
    return { me: toMe(auth.record) }
  }
  catch (error) {
    if (pocketBaseUnavailable(error)) throw createError(UNAVAILABLE)
    const e = error as { response?: { message?: string } }
    throw createError({ statusCode: 400, statusMessage: e.response?.message || 'That passkey didn\'t work.' })
  }
})
