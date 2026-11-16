import { saveRule } from '~~/server/data/rules'
import { attempt, sessionFor } from '~~/server/data/session'
import { RULE_KEYS } from '~~/server/utils/rules'

/** PATCH /api/rules/:id: changes one of the caller's rules (every field, as POST takes them). Answers { rule, applied }. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const id = recordId(getRouterParam(event, 'id'), 'That rule isn\'t there.')
  const body = await readFields<Record<string, unknown>>(event, RULE_KEYS)
  return await attempt(() => saveRule(s, id, body), 'That rule isn\'t there.')
})
