import { projections } from '~~/server/data/money'
import { attempt, sessionFor } from '~~/server/data/session'

/**
 * GET /api/projections: the savings rate from the last whole months, what's
 * invested now, and each debt with how fast it's being paid down
 * (shared/projections.ts).
 */
export default defineEventHandler(async (event) => {
  const s = sessionFor(event)
  return await attempt(() => projections(s))
})
