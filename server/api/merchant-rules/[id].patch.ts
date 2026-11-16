import { setMerchantRule } from '~~/server/data/rules'
import { attempt, sessionFor } from '~~/server/data/session'

/** PATCH /api/merchant-rules/:id { category }: where a learned merchant rule sends its transactions. Answers { rule, moved }. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const id = recordId(getRouterParam(event, 'id'), 'That rule isn\'t there.')
  const { category } = await readFields<{ category: string }>(event, ['category'])
  return await attempt(() => setMerchantRule(s, id, required(category, 'A category')), 'That rule isn\'t there.')
})
