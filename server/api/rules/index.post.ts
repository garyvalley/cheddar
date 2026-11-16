import { saveRule } from '~~/server/data/rules'
import { attempt, sessionFor } from '~~/server/data/session'
import { RULE_KEYS } from '~~/server/utils/rules'

/** POST /api/rules { text, min_cents, max_cents, account, category, rename, exclude, apply }: a new rule. Answers { rule, applied }. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const body = await readFields<Record<string, unknown>>(event, RULE_KEYS)
  const r = await attempt(() => saveRule(s, null, body))
  setResponseStatus(event, 201)
  return r
})
