import { register, requestVerification } from '~~/server/data/identity'
import { attempt, storeError } from '~~/server/data/session'
import { passwordProblem } from '~~/shared/passwords'
import { NAME_MAX } from '~~/shared/profile'

/**
 * POST /api/auth/register { email, password, name }: a new account, and the
 * email that confirms its address. The browser signs in next.
 */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const { email, password, name } = await readFields<{ email: string, password: string, name: string }>(event, ['email', 'password', 'name'])
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Email and password are required' })
  }
  const problem = passwordProblem(password)
  if (problem) throw createError({ statusCode: 400, statusMessage: problem })
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (trimmed.length > NAME_MAX) throw createError({ statusCode: 400, statusMessage: `Name must be at most ${NAME_MAX} characters.` })

  try {
    await register({ email, password, name: trimmed })
  }
  catch (error) {
    // PocketBase refuses a taken address with a field error. Saying so is
    // what every sign-up form does; the rate limit keeps it from being a
    // fast way to list accounts.
    const fields = (error as { response?: { data?: Record<string, { code?: string }> } }).response?.data
    if (fields?.email?.code === 'validation_not_unique') {
      throw createError({ statusCode: 400, statusMessage: 'That email already has an account. Sign in instead.' })
    }
    if (fields?.email) throw createError({ statusCode: 400, statusMessage: 'Enter a valid email address.' })
    throw storeError(error)
  }
  await attempt(() => requestVerification(email))
  setResponseStatus(event, 201)
  return null
})
