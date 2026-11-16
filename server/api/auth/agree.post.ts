import { agreeToTerms } from '~~/server/data/profile'
import { attempt, sessionFor } from '~~/server/data/session'

/** POST /api/auth/agree: the caller agrees to the Terms of Use in force (shared/legal.ts), after /agree showed them. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  return { me: await attempt(() => agreeToTerms(s)) }
})
