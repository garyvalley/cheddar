import { requestVerification } from '~~/server/data/identity'
import { attempt } from '~~/server/data/session'

/** POST /api/auth/request-verification { email }: Email the link that confirms an address. Answers 204 whether or not the address has an account. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const { email } = await readFields<{ email: string }>(event, ['email'])
  await attempt(() => requestVerification(required(email, 'Email')))
  setResponseStatus(event, 204)
  return null
})
