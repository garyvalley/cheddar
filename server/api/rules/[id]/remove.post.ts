import { removeRule } from '~~/server/data/rules'
import { attempt, sessionFor } from '~~/server/data/session'

/** POST /api/rules/:id/remove: deletes one of the caller's rules. Answers { resorted }. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const id = recordId(getRouterParam(event, 'id'), 'That rule isn\'t there.')
  return await attempt(() => removeRule(sessionFor(event), id), 'That rule isn\'t there.')
})
