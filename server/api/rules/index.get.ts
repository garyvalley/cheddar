import { listRules } from '~~/server/data/rules'
import { attempt, sessionFor } from '~~/server/data/session'

/** GET /api/rules: the caller's own rules and the merchant rules Cheddar learned. Answers { rules, merchant }. */
export default defineEventHandler(async event => await attempt(() => listRules(sessionFor(event))))
