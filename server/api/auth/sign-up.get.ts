import { signUpMode } from '~~/server/data/identity'
import { pocketBaseUnavailable } from '~~/shared/pocketbase-errors'

/**
 * GET /api/auth/sign-up -> { mode }: open, invite or closed, so the sign-up
 * page can say so up front. When the store can't be asked it says open: the
 * form shows, and the sign-up itself is still checked there.
 */
export default defineEventHandler(async () => {
  try {
    return { mode: await signUpMode() }
  }
  catch (error) {
    if (!pocketBaseUnavailable(error)) console.error('[sign-up] mode lookup failed', error)
    return { mode: 'open' as const }
  }
})
