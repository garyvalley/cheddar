import { listCategories } from '~~/server/data/money'
import { attempt, sessionFor } from '~~/server/data/session'

/** GET /api/categories: the caller's categories, built in first, then their own by name. */
export default defineEventHandler(async (event) => {
  const s = sessionFor(event)
  return { categories: await attempt(() => listCategories(s)) }
})
