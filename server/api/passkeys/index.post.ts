import { addPasskey } from '~~/server/data/passkeys'
import { attempt, sessionFor } from '~~/server/data/session'
import type { PasskeyAnswer } from '~~/shared/passkeys'

/** POST /api/passkeys { challengeId, name, credential }: adds the passkey the device just made. Answers { passkey }. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const body = await readFields<{ challengeId: string, name: string, credential: PasskeyAnswer }>(event, ['challengeId', 'name', 'credential'])
  if (typeof body.challengeId !== 'string' || !body.credential || typeof body.credential !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'That passkey request has expired. Try again.' })
  }
  const name = typeof body.name === 'string' ? body.name : ''
  return { passkey: await attempt(() => addPasskey(sessionFor(event), body.challengeId!, name, body.credential!)) }
})
