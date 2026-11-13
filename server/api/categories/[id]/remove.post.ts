import { isCustomId } from '~~/shared/categories'
import { setBudget } from '~~/server/data/budgets'
import { removeCategory } from '~~/server/data/categories'
import { attempt, sessionFor } from '~~/server/data/session'

/**
 * POST /api/categories/:id/remove: deletes one of the caller's own
 * categories, and its budget. Its transactions are sorted again on their
 * own. Answers { resorted }.
 */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const id = getRouterParam(event, 'id')
  if (!isCustomId(id)) throw createError({ statusCode: 404, statusMessage: 'That category isn\'t there.' })
  const result = await attempt(() => removeCategory(s, id), 'That category isn\'t there.')
  await attempt(() => setBudget(s, id, null))
  return result
})
