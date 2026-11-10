import { isCustomId } from '~~/shared/categories'
import { removeCategory } from '~~/server/data/money'
import { attempt, sessionFor } from '~~/server/data/session'

/**
 * POST /api/categories/:id/remove: deletes one of the caller's own
 * categories. Its transactions are sorted again on their own. Answers { resorted }.
 */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const id = getRouterParam(event, 'id')
  if (!isCustomId(id)) throw createError({ statusCode: 404, statusMessage: 'That category isn\'t there.' })
  return await attempt(() => removeCategory(s, id), 'That category isn\'t there.')
})
