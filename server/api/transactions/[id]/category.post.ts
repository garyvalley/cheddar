import { isCategoryRef } from '~~/shared/categories'
import { recategorize } from '~~/server/data/money'
import { attempt, sessionFor } from '~~/server/data/session'

/**
 * POST /api/transactions/:id/category { category }: moves a transaction to
 * another category, and teaches the merchant's rule. Answers
 * { transaction, moved }, `moved` being how many of the merchant's other
 * transactions followed.
 */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const id = recordId(getRouterParam(event, 'id'), 'That transaction isn\'t there.')
  const { category } = await readFields<{ category: string }>(event, ['category'])
  if (!isCategoryRef(category)) throw createError({ statusCode: 400, statusMessage: 'Choose one of the categories.' })
  return await attempt(() => recategorize(s, id, category), 'That transaction isn\'t there.')
})
