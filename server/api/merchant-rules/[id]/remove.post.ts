import { removeMerchantRule } from '~~/server/data/rules'
import { attempt, sessionFor } from '~~/server/data/session'

/** POST /api/merchant-rules/:id/remove: forgets a learned merchant rule. Answers { resorted }. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const id = recordId(getRouterParam(event, 'id'), 'That rule isn\'t there.')
  return await attempt(() => removeMerchantRule(sessionFor(event), id), 'That rule isn\'t there.')
})
